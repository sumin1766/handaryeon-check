import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { num } from "@/lib/format";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({ meta: [{ title: "대시보드 — 한다련 캠프" }] }),
  component: DashboardPage,
});

const CAT_ROWS = [
  { key: "lodging", label: "숙박", lodging: true },
  { key: "non_lodging", label: "비숙박", lodging: false },
] as const;

const CAT_COLS = [
  { key: "ms", label: "남학생", g: "M", a: "student" },
  { key: "fs", label: "여학생", g: "F", a: "student" },
  { key: "ma", label: "남자어른", g: "M", a: "adult" },
  { key: "fa", label: "여자어른", g: "F", a: "adult" },
] as const;

function DashboardPage() {
  const { season } = useActiveSeason();
  useRealtimeInvalidate(["churches", "people"], [["dashboard"]]);

  const { data } = useQuery({
    queryKey: ["dashboard", season?.id],
    enabled: !!season?.id,
    queryFn: async () => {
      const { data: churches } = await supabase
        .from("churches").select("id, is_checked_in, actual_count").eq("season_id", season!.id);
      const churchIds = (churches ?? []).map((c: any) => c.id);
      if (churchIds.length === 0) return { churches: churches ?? [], people: [] };
      const { data: people } = await supabase
        .from("people").select("church_id, gender, age_group, lodging").in("church_id", churchIds);
      return { churches: churches ?? [], people: people ?? [] };
    },
  });

  const churches = data?.churches ?? [];
  const people = data?.people ?? [];

  // 사전접수 기준 (모든 등록 인원)
  const preChurchCount = churches.length;
  const preTotal = people.length;
  const matrix = (lodging: boolean) => {
    const out: Record<string, number> = {};
    for (const c of CAT_COLS) {
      out[c.key] = people.filter(
        (p: any) => p.lodging === lodging && p.gender === c.g && p.age_group === c.a,
      ).length;
    }
    return out;
  };

  // 실접수 기준 (체크된 교회만)
  const checkedChurches = churches.filter((c: any) => c.is_checked_in);
  const actualChurchCount = checkedChurches.length;
  const actualTotal = checkedChurches.reduce((s: number, c: any) => s + (c.actual_count ?? 0), 0);
  const diffChurch = actualChurchCount - preChurchCount;
  const diffTotal = actualTotal - preTotal;
  const pctChurch = preChurchCount ? (diffChurch / preChurchCount) * 100 : 0;
  const pctTotal = preTotal ? (diffTotal / preTotal) * 100 : 0;

  if (!season) {
    return (
      <AppShell>
        <div className="text-sm text-muted-foreground">설정에서 시즌을 먼저 생성하세요.</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-6">
        <header className="flex items-end justify-between">
          <div>
            <h1 className="text-2xl font-bold">대시보드</h1>
            <p className="text-sm text-muted-foreground">{season.name} 현황</p>
          </div>
          <Link to="/pre-registration" className="text-xs text-primary hover:underline">사전접수 →</Link>
        </header>

        <section>
          <h2 className="text-base font-semibold mb-3">사전접수 현황</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
            <Kpi label="접수 교회" value={preChurchCount} unit="곳" />
            <Kpi label="전체 사전접수" value={preTotal} unit="명" />
            <Kpi label="숙박 인원" value={people.filter((p: any) => p.lodging).length} unit="명" />
            <Kpi label="비숙박 인원" value={people.filter((p: any) => !p.lodging).length} unit="명" />
          </div>
          <Card className="p-0 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-xs uppercase">
                <tr>
                  <th className="text-left px-3 py-2 w-20">구분</th>
                  {CAT_COLS.map((c) => (
                    <th key={c.key} className="text-right px-3 py-2">{c.label}</th>
                  ))}
                  <th className="text-right px-3 py-2 bg-primary/5">합계</th>
                </tr>
              </thead>
              <tbody>
                {CAT_ROWS.map((r) => {
                  const m = matrix(r.lodging);
                  const sum = Object.values(m).reduce((a, b) => a + b, 0);
                  return (
                    <tr key={r.key} className="border-t">
                      <td className="px-3 py-2 font-medium">{r.label}</td>
                      {CAT_COLS.map((c) => (
                        <td key={c.key} className="text-right px-3 py-2 tabular-nums">{num(m[c.key])}</td>
                      ))}
                      <td className="text-right px-3 py-2 font-semibold bg-primary/5 tabular-nums">{num(sum)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </section>

        <section>
          <h2 className="text-base font-semibold mb-3">실접수 현황</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <CompareCard label="실접수 교회" actual={actualChurchCount} pre={preChurchCount} diff={diffChurch} pct={pctChurch} unit="곳" />
            <CompareCard label="실접수 총인원" actual={actualTotal} pre={preTotal} diff={diffTotal} pct={pctTotal} unit="명" />
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-2xl font-bold tabular-nums">{num(value)}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
      </div>
    </Card>
  );
}

function CompareCard({ label, actual, pre, diff, pct, unit }: any) {
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Minus;
  const color = diff > 0 ? "text-emerald-600" : diff < 0 ? "text-rose-600" : "text-muted-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 flex items-baseline gap-3">
        <span className="text-3xl font-bold tabular-nums">{num(actual)}</span>
        <span className="text-xs text-muted-foreground">{unit}</span>
        <span className="text-xs text-muted-foreground ml-auto">사전 {num(pre)}{unit}</span>
      </div>
      <div className={`mt-2 inline-flex items-center gap-1 text-xs font-semibold ${color}`}>
        <Icon className="h-3 w-3" />
        {diff > 0 ? "+" : ""}{num(diff)} {unit} ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
      </div>
    </Card>
  );
}
