// 숙소 정렬 헬퍼.
// - manual=false: 층 숫자 → 방번호 숫자 → 이름 순으로 자동 정렬. 숫자 없는 값은 뒤로.
// - manual=true: sort_order 우선.
export type LodgingLike = {
  id: string;
  name: string;
  building: string | null;
  floor: string | null;
  sort_order?: number | null;
};

const INF = Number.POSITIVE_INFINITY;

export function extractNum(s: string | null | undefined): number {
  if (s == null) return INF;
  const m = String(s).match(/-?\d+/);
  return m ? parseInt(m[0], 10) : INF;
}

export function sortLodgings<T extends LodgingLike>(list: T[], manual: boolean): T[] {
  const arr = [...list];
  if (manual) {
    arr.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    return arr;
  }
  arr.sort((a, b) => {
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
