import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, MapPin, Search, X, Copy, Check, Download } from "lucide-react";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { cn } from "@/lib/utils";
import { downloadRowsAsXlsx } from "@/lib/export-xlsx";

export const Route = createFileRoute("/places")({
  head: () => ({ meta: [{ title: "장소배치 — 한다련 캠프" }] }),
  component: PlacesPage,
});

type Place = { id: string; season_id: string; name: string; purpose: string | null; note: string | null };
type Lodging = { id: string; name: string; building: string | null; floor: string | null; note: string | null; active: boolean };

function normalize(s: string) {
  return s.toLowerCase().replace(/\s+/g, "");
}

function PlacesPage() {
  const { season } = useActiveSeason();
  const qc = useQueryClient();
  useRealtimeInvalidate(["places"], [["places-view"], ["places-summary"], ["places-full"]]);

  const { data: places = [] } = useQuery({
    queryKey: ["places-view", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data, error } = await (supabase.from as any)("places")
        .select("*").eq("season_id", season!.id).order("name");
      if (error) throw error;
      return (data ?? []) as Place[];
    },
  });

  const { data: lodgings = [] } = useQuery({
    queryKey: ["places-lodgings-report", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data } = await supabase.from("lodgings")
        .select("id, name, building, floor, note, active")
        .eq("season_id", season!.id)
        .order("sort_order");
      return (data ?? []) as Lodging[];
    },
  });

  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const n = normalize(query);
    if (!n) return places;
    return places.filter((p) => {
      const hay = normalize(`${p.name} ${p.purpose ?? ""}`);
      return hay.includes(n);
    });
  }, [places, query]);

  const [editing, setEditing] = useState<Place | null>(null);
  const [purposeDraft, setPurposeDraft] = useState("");
  const [noteDraft, setNoteDraft] = useState("");
  const [copied, setCopied] = useState(false);

  const reportRows = useMemo(() => {
    const out: { 구분: string; 이름: string; "용도 / 세부": string; 비고: string }[] = [];
    for (const l of lodgings) {
      out.push({
        구분: "숙소",
        이름: l.name,
        "용도 / 세부": [l.building, l.floor].filter(Boolean).join(" · ") + (l.active ? "" : " (비활성)"),
        비고: l.note ?? "",
      });
    }
    for (const p of places) {
      out.push({ 구분: "장소", 이름: p.name, "용도 / 세부": p.purpose ?? "", 비고: p.note ?? "" });
    }
    return out;
  }, [lodgings, places]);

  const copyCsv = async () => {
    const esc = (v: string) => String(v ?? "").replace(/\t/g, " ").replace(/\r?\n/g, " ");
    const header = ["구분", "이름", "용도 / 세부", "비고"].join("\t");
    const body = reportRows
      .map((r) => [esc(r.구분), esc(r.이름), esc(r["용도 / 세부"]), esc(r.비고)].join("\t"))
      .join("\n");
    const text = `${header}\n${body}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success("복사됨 — 시트에 붙여넣으세요");
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

  const downloadXlsx = () => {
    downloadRowsAsXlsx(reportRows, "공간 통합 리포트", `공간통합리포트_${season?.name ?? "시즌"}.xlsx`);
  };

  const save = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const { error } = await (supabase.from as any)("places").update({
        purpose: purposeDraft.trim() || null,
        note: noteDraft.trim() || null,
      }).eq("id", editing.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("용도 저장됨");
      qc.invalidateQueries({ queryKey: ["places-view"] });
      setEditing(null);
    },
    onError: (e: any) => toast.error(e.message ?? "저장 실패"),
  });

  if (!season) {
    return (
      <AppShell>
        <div className="text-sm text-muted-foreground">활성 시즌이 없습니다.</div>
      </AppShell>
    );
  }

  const totalAssigned = places.filter((p) => p.purpose && p.purpose.trim() !== "").length;

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <MapPin className="h-6 w-6 text-primary" /> 장소배치
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              장소를 클릭해 용도 라벨을 지정하세요. 장소는 설정 → 장소 설정에서 추가/삭제할 수 있습니다.
            </p>
          </div>
          <div className="tabular-nums text-sm text-muted-foreground">
            총 <b className="text-foreground">{places.length}</b>개 · 용도 지정 <b className="text-foreground">{totalAssigned}</b>개
          </div>
        </header>

        <div className="relative max-w-md">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="장소명·용도 검색"
            className="pl-8 pr-8"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              aria-label="검색 초기화"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {query && (
          <div className="text-xs text-muted-foreground -mt-3">검색 결과: <b>{filtered.length}</b>개</div>
        )}

        {filtered.length === 0 ? (
          <Card className="p-8 text-center text-sm text-muted-foreground">
            {places.length === 0 ? "등록된 장소가 없습니다. 설정 → 장소 설정에서 추가하세요." : "일치하는 장소가 없습니다."}
          </Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {filtered.map((p) => {
              const hasPurpose = !!(p.purpose && p.purpose.trim());
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => { setEditing(p); setPurposeDraft(p.purpose ?? ""); setNoteDraft(p.note ?? ""); }}
                  className={cn(
                    "text-left rounded-lg border p-4 transition hover:shadow-md hover:border-primary/50",
                    hasPurpose ? "bg-primary/5 border-primary/30" : "bg-muted/30 border-dashed",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-semibold truncate">{p.name}</div>
                    <Badge variant={hasPurpose ? "default" : "outline"} className="shrink-0">
                      {hasPurpose ? "지정됨" : "미지정"}
                    </Badge>
                  </div>
                  <div className={cn(
                    "mt-2 text-sm min-h-[1.5rem]",
                    hasPurpose ? "text-foreground" : "text-muted-foreground italic",
                  )}>
                    {hasPurpose ? p.purpose : "용도 미지정 — 클릭하여 지정"}
                  </div>
                  {p.note && <div className="mt-1 text-xs text-muted-foreground truncate">비고: {p.note}</div>}
                </button>
              );
            })}
          </div>
        )}

        {/* 리포트: 숙소 + 장소 통합 집계 */}
        <section className="mt-8">
          <h2 className="text-lg font-semibold mb-2 flex items-center gap-2">
            <Building2 className="h-5 w-5" /> 시즌 공간 통합 리포트
          </h2>
          <p className="text-xs text-muted-foreground mb-3">
            이 시즌에 등록된 숙소와 장소를 함께 나열합니다. (조회 전용)
          </p>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 w-20">구분</th>
                  <th className="text-left px-3 py-2">이름</th>
                  <th className="text-left px-3 py-2">용도 / 세부</th>
                  <th className="text-left px-3 py-2">비고</th>
                </tr>
              </thead>
              <tbody>
                {lodgings.map((l) => (
                  <tr key={`l-${l.id}`} className="border-t">
                    <td className="px-3 py-2"><Badge variant="secondary">숙소</Badge></td>
                    <td className="px-3 py-2 font-medium">{l.name}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {[l.building, l.floor].filter(Boolean).join(" · ") || "-"}
                      {!l.active && <span className="ml-2 text-xs text-destructive">(비활성)</span>}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{l.note ?? "-"}</td>
                  </tr>
                ))}
                {places.map((p) => (
                  <tr key={`p-${p.id}`} className="border-t">
                    <td className="px-3 py-2"><Badge>장소</Badge></td>
                    <td className="px-3 py-2 font-medium">{p.name}</td>
                    <td className={cn("px-3 py-2", p.purpose ? "" : "text-muted-foreground italic")}>
                      {p.purpose || "미지정"}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{p.note ?? "-"}</td>
                  </tr>
                ))}
                {lodgings.length === 0 && places.length === 0 && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">데이터가 없습니다.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <Dialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.name} — 용도 지정</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">용도 (자유 입력)</Label>
              <Input
                value={purposeDraft}
                onChange={(e) => setPurposeDraft(e.target.value)}
                placeholder="예: 청년부 예배, 식당, 세미나"
                autoFocus
              />
            </div>
            <div>
              <Label className="text-xs">비고</Label>
              <Input
                value={noteDraft}
                onChange={(e) => setNoteDraft(e.target.value)}
                placeholder="추가 메모"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>취소</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>저장</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}
