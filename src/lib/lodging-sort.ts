// 숙소 정렬 헬퍼.
// - manual=false: 건물(교육관→본당→기타→기타 알파벳) → 층 숫자 → 방번호 숫자 → 이름.
// - manual=true : sort_order 우선.
export type LodgingLike = {
  id: string;
  name: string;
  building: string | null;
  floor: string | null;
  sort_order?: number | null;
};

const INF = Number.POSITIVE_INFINITY;
const BUILDING_ORDER = ["교육관", "본당", "기타"];

export function extractNum(s: string | null | undefined): number {
  if (s == null) return INF;
  const m = String(s).match(/-?\d+/);
  return m ? parseInt(m[0], 10) : INF;
}

function buildingRank(b: string | null | undefined): number {
  const key = b ?? "기타";
  const i = BUILDING_ORDER.indexOf(key);
  return i === -1 ? 999 : i;
}

export function sortLodgings<T extends LodgingLike>(list: T[], manual: boolean): T[] {
  const arr = [...list];
  if (manual) {
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return arr;
  }
  arr.sort((a, b) => {
    const ba = buildingRank(a.building);
    const bb = buildingRank(b.building);
    if (ba !== bb) return ba - bb;
    if (ba === 999) {
      const cmp = String(a.building ?? "").localeCompare(String(b.building ?? ""), "ko");
      if (cmp !== 0) return cmp;
    }
    const fa = extractNum(a.floor);
    const fb = extractNum(b.floor);
    if (fa !== fb) return fa - fb;
    const ra = extractNum(a.name);
    const rb = extractNum(b.name);
    if (ra !== rb) return ra - rb;
    return String(a.name).localeCompare(String(b.name), "ko");
  });
  return arr;
}
