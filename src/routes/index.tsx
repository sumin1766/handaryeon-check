import { createFileRoute } from "@tanstack/react-router";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { num } from "@/lib/format";
import { fetchAll } from "@/lib/fetch-all";
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
        .from("churches").select("id, name, denomination, is_checked_in, actual_count").eq("season_id", season!.id);
      const churchIds = (churches ?? []).map((c: any) => c.id);
      if (churchIds.length === 0) return { churches: churches ?? [], people: [] };
      const people = await fetchAll<any>("people", (q) =>
        q.select("church_id, gender, age_group, lodging").in("church_id", churchIds),
      );
      return { churches: churches ?? [], people };
    },
  });

  const churches = data?.churches ?? [];
  const people = data?.people ?? [];

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
      <div className="lumina-scope -mx-6 -my-6 min-h-[calc(100vh-130px)]">
        <div className="mx-auto max-w-[1200px] px-10 py-12 space-y-12">
          <header>
            <h1
              className="font-bold"
              style={{ fontSize: "40px", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}
            >
              대시보드
            </h1>
            <p
              className="lumina-muted mt-2"
              style={{ fontSize: "22px", fontWeight: 600, letterSpacing: "-0.01em" }}
            >
              {season.name} 현황
            </p>
          </header>

          <section>
            <h2 className="font-semibold mb-5" style={{ fontSize: "24px", fontWeight: 600, letterSpacing: "-0.01em" }}>
              사전접수 현황
            </h2>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-5 mb-6">
              <Kpi label="접수 교회" value={preChurchCount} unit="교회" />
              <Kpi label="전체 사전접수" value={preTotal} unit="명" />
              <Kpi label="숙박 인원" value={people.filter((p: any) => p.lodging).length} unit="명" />
              <Kpi label="비숙박 인원" value={people.filter((p: any) => !p.lodging).length} unit="명" />
            </div>
            <div className="lumina-glass p-3">
              <div className="overflow-x-auto rounded-[1.15rem]">
                <table className="w-full min-w-[640px] tabular-nums border-separate border-spacing-0 whitespace-nowrap">
                  <thead style={{ background: "var(--lumina-surface-high)" }}>
                    <tr className="lumina-muted">
                      <th className="text-center px-5 py-4 w-32" style={{ fontSize: "16px", fontWeight: 600 }}>구분</th>
                      {CAT_COLS.map((c) => (
                        <th key={c.key} className="text-center px-5 py-4" style={{ fontSize: "16px", fontWeight: 600 }}>{c.label}</th>
                      ))}
                      <th className="text-center px-5 py-4 lumina-sum-cell" style={{ fontSize: "16px", fontWeight: 600 }}>합계</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CAT_ROWS.map((r, idx) => {
                      const m = matrix(r.lodging);
                      const sum = Object.values(m).reduce((a, b) => a + b, 0);
                      const topBorder = idx === 0 ? "none" : "1px solid var(--lumina-border)";
                      return (
                        <tr key={r.key}>
                          <td className="text-center px-5 py-6" style={{ fontSize: "21px", fontWeight: 600, borderTop: topBorder }}>{r.label}</td>
                          {CAT_COLS.map((c) => (
                            <td key={c.key} className="text-center px-5 py-6" style={{ fontSize: "21px", fontWeight: 600, borderTop: topBorder, fontVariantNumeric: "tabular-nums" }}>{num(m[c.key])}</td>
                          ))}
                          <td className="text-center px-5 py-6 lumina-sum-cell" style={{ fontSize: "21px", fontWeight: 700, borderTop: topBorder, fontVariantNumeric: "tabular-nums" }}>
                            {num(sum)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

          </section>

          <section>
            <h2 className="font-semibold mb-5" style={{ fontSize: "24px", fontWeight: 600, letterSpacing: "-0.01em" }}>
              실접수 현황
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <CompareCard label="실접수 교회" actual={actualChurchCount} pre={preChurchCount} diff={diffChurch} pct={pctChurch} unit="교회" />
              <CompareCard label="실접수 총인원" actual={actualTotal} pre={preTotal} diff={diffTotal} pct={pctTotal} unit="명" />
            </div>
          </section>
        </div>
      </div>
    </AppShell>
  );
}

function Kpi({ label, value, unit, accent }: { label: string; value: number; unit: string; accent?: boolean }) {
  return (
    <div className="lumina-glass p-7">
      <div className="text-sm lumina-muted font-medium">{label}</div>
      <div className="mt-3 flex items-baseline gap-2">
        <span
          className={accent ? "lumina-accent" : "lumina-num"}
          style={{ fontSize: "52px", fontWeight: 700, letterSpacing: "-0.03em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}
        >
          {num(value)}
        </span>
        <span className="lumina-muted" style={{ fontSize: "16px" }}>{unit}</span>
      </div>
    </div>
  );
}

function CompareCard({ label, actual, pre, diff, pct, unit }: any) {
  const Icon = diff > 0 ? ArrowUp : diff < 0 ? ArrowDown : Minus;
  const trend =
    diff > 0
      ? { color: "#ffffff", bg: "#0d8a5a" }
      : diff < 0
        ? { color: "#ffffff", bg: "#ba1a1a" }
        : { color: "var(--lumina-fg-muted)", bg: "var(--lumina-surface-high)" };
  return (
    <div className="lumina-glass p-7">
      <div className="text-sm lumina-muted font-medium">{label}</div>
      <div className="mt-3 flex items-baseline gap-3 flex-wrap">
        <span
          className="lumina-num"
          style={{ fontSize: "56px", fontWeight: 700, letterSpacing: "-0.04em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}
        >
          {num(actual)}
        </span>
        <span className="lumina-muted" style={{ fontSize: "16px" }}>{unit}</span>
        <span className="text-sm lumina-muted ml-auto">사전 {num(pre)}{unit}</span>
      </div>
      <div
        className="mt-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold"
        style={{ color: trend.color, background: trend.bg }}
      >
        <Icon className="h-4 w-4" style={{ color: trend.color }} />
        {diff > 0 ? "+" : ""}{num(diff)} {unit} ({pct >= 0 ? "+" : ""}{pct.toFixed(1)}%)
      </div>
    </div>
  );
}
