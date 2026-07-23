import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Copy, Check } from "lucide-react";
import { downloadRowsAsXlsx } from "@/lib/export-xlsx";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/nametags")({
  head: () => ({ meta: [{ title: "이름표 출력 — 한다련 캠프" }] }),
  component: NametagsPage,
});

function NametagsPage() {
  const { season } = useActiveSeason();
  useRealtimeInvalidate(["churches", "people"], [["nametag-page", season?.id]]);
  const { data } = useQuery({
    queryKey: ["nametag-page", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data: churches } = await supabase
        .from("churches").select("id, name, denomination").eq("season_id", season!.id).order("name");
      const ids = (churches ?? []).map((c: any) => c.id);
      const people = ids.length
        ? await fetchAll<any>("people", (q) => q.select("church_id, name").in("church_id", ids))
        : [];
      return { churches: churches ?? [], people };
    },
  });

  const [copied, setCopied] = useState(false);

  if (!season) return <AppShell><div className="text-sm text-muted-foreground">시즌이 없습니다.</div></AppShell>;

  const churches = data?.churches ?? [];
  const people = data?.people ?? [];

  const peopleByChurch = new Map<string, any[]>();
  for (const p of people) {
    const arr = peopleByChurch.get(p.church_id) ?? [];
    arr.push(p);
    peopleByChurch.set(p.church_id, arr);
  }

  const flatRows: { no: number; church: string; name: string; churchId: string }[] = [];
  let no = 0;
  for (const c of churches) {
    const label = c.denomination ? `${c.name}(${c.denomination})` : c.name;
    const ppl = peopleByChurch.get(c.id) ?? [];
    for (const p of ppl) {
      no += 1;
      flatRows.push({ no, church: label, name: p.name, churchId: c.id });
    }
  }

  const download = () => {
    const rows = flatRows.map((r) => ({ No: r.no, 교회: r.church, 명단: r.name }));
    downloadRowsAsXlsx(rows, "전체 등록자 명단", `${season.name}_이름표.xlsx`);
  };

  // TSV (탭 구분) — 구글 스프레드시트에 붙여넣으면 셀별로 자동 분리됩니다.
  const copyCsv = async () => {
    const escape = (v: string | number) =>
      String(v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
    const header = ["No", "교회", "명단"].join("\t");
    const body = flatRows
      .map((r) => [r.no, escape(r.church), escape(r.name)].join("\t"))
      .join("\n");
    const text = `${header}\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("복사됨 — 구글 시트에 붙여넣으세요");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        toast.success("복사됨");
        setTimeout(() => setCopied(false), 1800);
      } catch {
        toast.error("복사 실패");
      } finally {
        document.body.removeChild(ta);
      }
    }
  };

  return (
    <AppShell>
      <div className="space-y-4">
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">이름표 출력</h1>
            <p className="text-sm text-muted-foreground">사전접수·현장접수 등록자 전체 명단 (총 {flatRows.length}명)</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={copyCsv}>
              {copied ? <Check className="h-4 w-4 mr-1" /> : <Copy className="h-4 w-4 mr-1" />}
              {copied ? "복사됨" : "CSV 복사"}
            </Button>
            <Button onClick={download}><Download className="h-4 w-4 mr-1" />엑셀 다운로드(.xlsx)</Button>
          </div>
        </header>

        <Card className="p-0 overflow-hidden">
          <div className="bg-primary text-primary-foreground px-4 py-3 text-base font-bold tracking-wide">전체 등록자 명단</div>
          <div className="overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase sticky top-0">
                <tr>
                  <th className="text-right px-3 py-2 w-20">No</th>
                  <th className="text-left px-3 py-2 w-80">교회</th>
                  <th className="text-left px-3 py-2">명단</th>
                </tr>
              </thead>
              <tbody>
                {flatRows.map((r, i) => {
                  const prev = flatRows[i - 1];
                  const groupStart = !prev || prev.churchId !== r.churchId;
                  return (
                    <tr key={i} className={`${groupStart ? "border-t-2 border-foreground/20" : "border-t"} hover:bg-muted/30`}>
                      <td className="text-right px-3 py-1.5 tabular-nums text-muted-foreground">{r.no}</td>
                      <td className={`px-3 py-1.5 ${groupStart ? "font-semibold" : "text-muted-foreground/50"}`}>
                        {groupStart ? r.church : ""}
                      </td>
                      <td className="px-3 py-1.5">{r.name}</td>
                    </tr>
                  );
                })}
                {flatRows.length === 0 && (
                  <tr><td colSpan={3} className="text-center py-10 text-sm text-muted-foreground">등록자가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
