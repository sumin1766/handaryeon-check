import { createFileRoute } from "@tanstack/react-router";
import type * as React from "react";
import { AppShell } from "@/components/app-shell";
import { useActiveSeason } from "@/lib/use-active-season";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { num } from "@/lib/format";
import { fetchAll } from "@/lib/fetch-all";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { useDashboardOrder, DEFAULT_DASHBOARD_ORDER } from "@/lib/dashboard-order";

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
  const { data: order } = useDashboardOrder(season?.id);
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

  // 세계로 부서 분류 (registry.tsx의 세계로 필터와 동일 판별: name.includes("세계로"))
  // 시스템 이해: 세계로교회는 하나의 교회이지만, 신청이 부서 단위(중등·고등·3·2·1청년·우남·일반)로 나뉘어
  // 각각 별도 그룹으로 집계된다. 우남은 학교이므로 학년별 반, 교직원, 학부모 등으로 다시 여러 그룹으로
  // 세분화되어 그룹 수가 많게 나온다(예: 우남 8개 그룹). 이는 정상 동작이며 중복이나 오류가 아니다.
  // 따라서 대시보드 카드의 부서/합계 아래에는 "개 그룹"을 표시하고, 진짜 서로 다른 교회들의 합인
  // "외부교회"만 "개 교회"로 남긴다.
  const SEGUE_DEPTS = [
    { key: "중등", kw: "중등" },
    { key: "고등", kw: "고등" },
    { key: "3청년", kw: "3청년" },
    { key: "2청년", kw: "2청년" },
    { key: "1청년", kw: "1청년" },
    { key: "우남", kw: "우남" },
    { key: "일반", kw: null as string | null },
  ] as const;
  const classifySegueDept = (c: any) => {
    const s = `${c.name ?? ""} ${c.denomination ?? ""}`;
    for (const d of SEGUE_DEPTS) {
      if (d.kw && s.includes(d.kw)) return d.key;
    }
    return "일반";
  };
  const churchDept = new Map<string, string>();
  const segueChurches: any[] = [];
  const externalChurches: any[] = [];
  for (const c of churches) {
    const isSegue = !!(c.name && c.name.includes("세계로"));
    if (isSegue) {
      const dept = classifySegueDept(c);
      churchDept.set(c.id, dept);
      segueChurches.push({ ...c, __dept: dept });
    } else {
      externalChurches.push(c);
    }
  }
  const deptPeopleCount: Record<string, number> = Object.fromEntries(SEGUE_DEPTS.map((d) => [d.key, 0]));
  const deptChurchCount: Record<string, number> = Object.fromEntries(SEGUE_DEPTS.map((d) => [d.key, 0]));
  for (const c of segueChurches) deptChurchCount[c.__dept] += 1;
  let externalPeople = 0;
  for (const p of people) {
    const dept = churchDept.get(p.church_id);
    if (dept) deptPeopleCount[dept] += 1;
    else externalPeople += 1;
  }
  const segueTotal = Object.values(deptPeopleCount).reduce((a, b) => a + b, 0);
  const grandCheck = segueTotal + externalPeople;

  if (typeof window !== "undefined" && churches.length > 0) {
    // 검증용 로그
    const generalList = segueChurches.filter((c) => c.__dept === "일반").map((c) => `${c.name} (${c.denomination ?? ""})`);
    console.log("[dashboard] 세계로 부서별 집계", SEGUE_DEPTS.map((d) => ({
      부서: d.key, 교회수: deptChurchCount[d.key], 인원: deptPeopleCount[d.key],
    })));
    console.log("[dashboard] 일반으로 분류된 세계로 교회", generalList);
    console.log("[dashboard] 총합 대조", { 세계로합계: segueTotal, 외부: externalPeople, 총합: grandCheck, 전체사전접수: preTotal, 일치: grandCheck === preTotal });
  }

  if (!season) {
    return (
      <AppShell>
        <div className="text-sm text-muted-foreground">설정에서 시즌을 먼저 생성하세요.</div>
      </AppShell>
    );
  }

  const sections: Record<"pre" | "segue" | "actual", React.ReactNode> = {
    pre: (
      <section key="pre">
        <h2 className="lumina-section-title font-semibold mb-5">사전접수 현황</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-6">
          <Kpi label="접수 교회" value={preChurchCount} unit="교회" />
          <Kpi label="전체 사전접수" value={preTotal} unit="명" />
          <Kpi label="숙박 인원" value={people.filter((p: any) => p.lodging).length} unit="명" />
          <Kpi label="비숙박 인원" value={people.filter((p: any) => !p.lodging).length} unit="명" />
        </div>
        <div className="lumina-glass p-2 sm:p-3">
          <div className="overflow-x-auto rounded-[1.15rem]">
            <table className="w-full min-w-[520px] tabular-nums border-separate border-spacing-0 whitespace-nowrap">
              <thead style={{ background: "var(--lumina-surface-high)" }}>
                <tr className="lumina-muted">
                  <th className="text-center px-3 sm:px-5 py-3 sm:py-4 w-24 sm:w-32 text-[13px] sm:text-base font-semibold">구분</th>
                  {CAT_COLS.map((c) => (
                    <th key={c.key} className="text-center px-2 sm:px-5 py-3 sm:py-4 text-[13px] sm:text-base font-semibold">{c.label}</th>
                  ))}
                  <th className="text-center px-2 sm:px-5 py-3 sm:py-4 lumina-sum-cell text-[13px] sm:text-base font-semibold">합계</th>
                </tr>
              </thead>
              <tbody>
                {CAT_ROWS.map((r, idx) => {
                  const m = matrix(r.lodging);
                  const sum = Object.values(m).reduce((a, b) => a + b, 0);
                  const topBorder = idx === 0 ? "none" : "1px solid var(--lumina-border)";
                  return (
                    <tr key={r.key}>
                      <td className="text-center px-3 sm:px-5 py-4 sm:py-6 text-base sm:text-[21px] font-semibold" style={{ borderTop: topBorder }}>{r.label}</td>
                      {CAT_COLS.map((c) => (
                        <td key={c.key} className="text-center px-2 sm:px-5 py-4 sm:py-6 text-base sm:text-[21px] font-semibold tabular-nums" style={{ borderTop: topBorder }}>{num(m[c.key])}</td>
                      ))}
                      <td className="text-center px-2 sm:px-5 py-4 sm:py-6 lumina-sum-cell text-base sm:text-[21px] font-bold tabular-nums" style={{ borderTop: topBorder }}>
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
    ),
    segue: (
      <section key="segue">
        <h2 className="lumina-section-title font-semibold mb-5">세계로교회 · 외부교회 집계</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
          {SEGUE_DEPTS.map((d) => (
            <MiniStat
              key={d.key}
              label={`세계로 ${d.key}`}
              value={deptPeopleCount[d.key]}
              sub={`${deptChurchCount[d.key]}개 그룹`}
            />
          ))}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          <MiniStat label="세계로 합계" value={segueTotal} sub={`${segueChurches.length}개 그룹`} strong />
          <MiniStat label="외부교회" value={externalPeople} sub={`${externalChurches.length}개 교회`} strong />
          <MiniStat
            label="합계 대조"
            value={grandCheck}
            sub={grandCheck === preTotal ? "전체와 일치" : `전체 ${preTotal}명과 불일치`}
            strong
          />
        </div>
      </section>
    ),
    actual: (
      <section key="actual">
        <h2 className="lumina-section-title font-semibold mb-5">실접수 현황</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-5">
          <CompareCard label="실접수 교회" actual={actualChurchCount} pre={preChurchCount} diff={diffChurch} pct={pctChurch} unit="교회" />
          <CompareCard label="실접수 총인원" actual={actualTotal} pre={preTotal} diff={diffTotal} pct={pctTotal} unit="명" />
        </div>
      </section>
    ),
  };
  const activeOrder = order ?? DEFAULT_DASHBOARD_ORDER;

  return (
    <AppShell>
      <style>{`
        .lumina-section-title { font-size: 20px; letter-spacing: -0.01em; }
        @media (min-width: 640px) { .lumina-section-title { font-size: 24px; } }
        .lumina-kpi-num { font-size: 36px; }
        @media (min-width: 640px) { .lumina-kpi-num { font-size: 52px; } }
        .lumina-compare-num { font-size: 40px; }
        @media (min-width: 640px) { .lumina-compare-num { font-size: 56px; } }
        .lumina-title { font-size: 28px; }
        @media (min-width: 640px) { .lumina-title { font-size: 40px; } }
        .lumina-subtitle { font-size: 16px; }
        @media (min-width: 640px) { .lumina-subtitle { font-size: 22px; } }
      `}</style>
      <div className="lumina-scope -mx-6 -my-6 min-h-[calc(100vh-130px)]">
        <div className="mx-auto max-w-[1200px] px-4 sm:px-10 py-8 sm:py-12 space-y-8 sm:space-y-12">
          <header>
            <h1 className="lumina-title font-bold" style={{ fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>
              대시보드
            </h1>
            <p className="lumina-muted lumina-subtitle mt-2" style={{ fontWeight: 600, letterSpacing: "-0.01em" }}>
              {season.name} 현황
            </p>
          </header>
          {activeOrder.map((k) => sections[k])}
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

function MiniStat({ label, value, sub, strong }: { label: string; value: number; sub?: string; strong?: boolean }) {
  return (
    <div className="lumina-glass p-5">
      <div className="text-sm lumina-muted font-medium">{label}</div>
      <div className="mt-2 flex items-baseline gap-2">
        <span
          className="lumina-num"
          style={{ fontSize: strong ? "36px" : "30px", fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}
        >
          {num(value)}
        </span>
        <span className="lumina-muted" style={{ fontSize: "14px" }}>명</span>
      </div>
      {sub && <div className="mt-2 text-xs lumina-muted">{sub}</div>}
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
