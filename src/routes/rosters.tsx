import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Printer, Copy, Check } from "lucide-react";
import { downloadRowsAsXlsx } from "@/lib/export-xlsx";
import { useState } from "react";
import { toast } from "sonner";

export const Route = createFileRoute("/rosters")({
  head: () => ({ meta: [{ title: "명단 출력 — 한다련 캠프" }] }),
  component: RostersPage,
});

function RostersPage() {
  const { season } = useActiveSeason();
  useRealtimeInvalidate(["churches", "people"], [["rosters-page", season?.id]]);
  const { data } = useQuery({
    queryKey: ["rosters-page", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data: churches } = await supabase
        .from("churches")
        .select("id, name, denomination, contact_name, phone")
        .eq("season_id", season!.id)
        .order("name");
      const ids = (churches ?? []).map((c: any) => c.id);
      const people = ids.length
        ? await fetchAll<any>("people", (q) => q.select("church_id").in("church_id", ids))
        : [];
      return { churches: churches ?? [], people };
    },
  });

  if (!season)
    return (
      <AppShell>
        <div className="text-sm text-muted-foreground">시즌이 없습니다.</div>
      </AppShell>
    );

  const churches = data?.churches ?? [];
  const people = data?.people ?? [];

  const countByChurch = new Map<string, number>();
  for (const p of people) countByChurch.set(p.church_id, (countByChurch.get(p.church_id) ?? 0) + 1);

  const rows = churches
    .map((c: any) => ({
      id: c.id,
      name: c.name as string,
      denomination: (c.denomination ?? "") as string,
      contact: [c.contact_name, c.phone].filter(Boolean).join(" / ") || "-",
      count: countByChurch.get(c.id) ?? 0,
    }))
    .sort((a: any, b: any) => a.name.localeCompare(b.name, "ko"));

  const totalPeople = rows.reduce((s: number, r: any) => s + r.count, 0);

  const [copied, setCopied] = useState(false);

  const download = () => {
    const xlsx = rows.map((r: any) => ({
      교회명: r.name,
      교단: r.denomination,
      "담당자 연락처": r.contact,
      인원수: r.count,
    }));
    downloadRowsAsXlsx(xlsx, "교회별 명단", `${season.name}_명단.xlsx`);
  };

  // TSV (탭 구분) — 구글 스프레드시트에 붙여넣으면 셀별로 자동 분리됩니다.
  const copyCsv = async () => {
    const escape = (v: string) => String(v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
    const header = ["교회명", "교단", "담당자 연락처", "인원수"].join("\t");
    const body = rows
      .map((r: any) => [escape(r.name), escape(r.denomination), escape(r.contact), r.count].join("\t"))
      .join("\n");
    const text = `${header}\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("복사됨 — 구글 시트에 붙여넣으세요");
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Fallback for insecure context
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
      <style>{`
        @media print {
          body { background: white !important; }
          .print-hide { display: none !important; }
          .print-page { padding: 0 !important; }
        }
      `}</style>
      <div className="space-y-4 print-page">
        <header className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 className="text-2xl font-bold">명단 출력</h1>
            <p className="text-sm text-muted-foreground">
              교회별 명단 · 총 {rows.length}개 교회 / {totalPeople}명
            </p>
          </div>
          <div className="flex gap-2 print-hide">
            <Button variant="outline" onClick={() => window.print()}>
              <Printer className="h-4 w-4 mr-1" />
              인쇄
            </Button>
            <Button onClick={download}>
              <Download className="h-4 w-4 mr-1" />
              엑셀 다운로드(.xlsx)
            </Button>
          </div>
        </header>

        <Card className="p-0 overflow-hidden">
          <div className="bg-primary text-primary-foreground px-4 py-3 text-base font-bold tracking-wide">
            교회별 명단 (가나다순)
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/60 text-xs uppercase">
                <tr>
                  <th className="text-right px-3 py-2 w-16">No</th>
                  <th className="text-left px-3 py-2">교회명</th>
                  <th className="text-left px-3 py-2 w-40">교단</th>
                  <th className="text-left px-3 py-2 w-64">담당자 연락처</th>
                  <th className="text-right px-3 py-2 w-24">인원수</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r: any, i: number) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30">
                    <td className="text-right px-3 py-1.5 tabular-nums text-muted-foreground">{i + 1}</td>
                    <td className="px-3 py-1.5 font-medium">{r.name}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.denomination}</td>
                    <td className="px-3 py-1.5">{r.contact}</td>
                    <td className="text-right px-3 py-1.5 tabular-nums font-semibold">{r.count}</td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="text-center py-10 text-sm text-muted-foreground">
                      등록된 교회가 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
              {rows.length > 0 && (
                <tfoot className="bg-muted/40 border-t-2 border-foreground/20">
                  <tr>
                    <td className="px-3 py-2" />
                    <td className="px-3 py-2 font-bold" colSpan={3}>
                      합계 ({rows.length}개 교회)
                    </td>
                    <td className="text-right px-3 py-2 font-bold tabular-nums">{totalPeople}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}
