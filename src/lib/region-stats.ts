import { KOREA_REGIONS, SIDO_LIST } from "@/lib/korea-regions";

export type RegionChurch = { id: string; season_id: string; primary_pre_registration_id: string | null };
export type RegionRegistration = { id: string; season_id: string; church_id: string | null; region_sido: string | null; region_sigungu: string | null; created_at: string; status: string };
export type RegionRow = { sido: string; sigungu: string; count: number; kind: "district" | "subtotal" | "unknown" | "total" };
export type RegionStats = { seasonId: string; seasonName: string; total: number; unknown: number; provinces: Record<string, number>; rows: RegionRow[] };

function validRegion(r: RegionRegistration) {
  const sido = r.region_sido?.trim() ?? "";
  const sigungu = r.region_sigungu?.trim() ?? "";
  return KOREA_REGIONS[sido]?.includes(sigungu) ? { sido, sigungu } : null;
}

/** Shared display units for totals and exports; no persisted merging or new counting rules. */
export function confirmedRegionUnits(seasonId: string, churches: RegionChurch[], registrations: RegionRegistration[]) {
  const groups = new Map<string, RegionRegistration[]>();
  const currentChurches = churches.filter((c) => c.season_id === seasonId);
  const currentIds = new Set(currentChurches.map((c) => c.id));
  for (const r of registrations.filter((r) => r.season_id === seasonId && r.status === "applied")) {
    const key = r.church_id && currentIds.has(r.church_id) ? `church:${r.church_id}` : `registration:${r.id}`;
    groups.set(key, [...(groups.get(key) ?? []), r]);
  }
  const primary = new Map(currentChurches.map((c) => [`church:${c.id}`, c.primary_pre_registration_id]));
  return [...groups].map(([key, regs]) => {
    const ordered = [...regs].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    const primaryId = primary.get(key);
    // Missing/invalid primary addresses also fall back within the same confirmed church unit.
    const selected = (primaryId ? ordered.find((r) => r.id === primaryId && validRegion(r)) : undefined) ?? ordered.find((r) => validRegion(r));
    return { key, churchId: key.startsWith("church:") ? key.slice(7) : null, registrations: ordered, address: selected ? validRegion(selected) : null };
  });
}

/** Display-only aggregation: only confirmed (applied) submissions count; linked submissions are one church; never merge by name. */
export function aggregateRegions(seasonId: string, seasonName: string, churches: RegionChurch[], registrations: RegionRegistration[]): RegionStats {
  const units = confirmedRegionUnits(seasonId, churches, registrations);
  const provinces = Object.fromEntries(SIDO_LIST.map((s) => [s, 0]));
  const districts = new Map<string, number>();
  let unknown = 0;
  for (const { address } of units) {
    if (!address) { unknown++; continue; }
    provinces[address.sido]++;
    const districtKey = `${address.sido}|${address.sigungu}`;
    districts.set(districtKey, (districts.get(districtKey) ?? 0) + 1);
  }
  const rows: RegionRow[] = [];
  for (const sido of SIDO_LIST) {
    if (!provinces[sido]) continue;
    rows.push({ sido, sigungu: "소계", count: provinces[sido], kind: "subtotal" });
    for (const sigungu of KOREA_REGIONS[sido] ?? []) {
      const count = districts.get(`${sido}|${sigungu}`) ?? 0;
      if (count) rows.push({ sido, sigungu, count, kind: "district" });
    }
  }
  rows.push({ sido: "미입력/미분류", sigungu: "—", count: unknown, kind: "unknown" });
  rows.push({ sido: "전국 합계", sigungu: "", count: units.length, kind: "total" });
  return { seasonId, seasonName, total: units.length, unknown, provinces, rows };
}

export type ColorBin = { min: number; max: number; level: number };
export function regionBins(provinces: Record<string, number>): ColorBin[] {
  const values = Object.values(provinces).filter((n) => n > 0);
  const max = Math.max(0, ...values);
  if (!max) return [];
  if (max < 3) return [{ min: 1, max: 1, level: 1 }, { min: 2, max: 2, level: 3 }, { min: 3, max: Infinity, level: 5 }];
  const min = Math.min(...values);
  // At least three visual levels; only occupied integer ranges are shown for sparse data.
  const steps = Math.min(5, Math.max(3, new Set(values).size));
  const width = Math.ceil((max - min + 1) / steps);
  const bins: ColorBin[] = [];
  for (let i = 0, start = min; start <= max; i++, start += width) {
    bins.push({ min: start, max: Math.min(max, start + width - 1), level: Math.round(i * 4 / Math.max(1, Math.ceil((max - min + 1) / width) - 1)) + 1 });
  }
  return bins;
}
export function regionLevel(count: number, bins: ColorBin[]) {
  return count === 0 ? 0 : bins.find((b) => count >= b.min && count <= b.max)?.level ?? 1;
}
/** 지도 단계(regionLevel 결과)에 맞춘 카드 글자 대비 — 진한 단계(3 이상)는 밝은 글자. */
export function regionLevelIsDark(level: number) {
  return level >= 3;
}
