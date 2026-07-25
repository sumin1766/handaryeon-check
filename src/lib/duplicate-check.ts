// 중복 교회 감지 유틸
// 규칙:
// - 교회명 다르면 중복 아님
// - 교회명 같아도 교단 다르면 중복 아님 (공백 제거 후 비교)
// - 교회명·교단 같아도 겹치는 사람 수가 2명 미만이면 중복 아님
// - 겹치는 사람 기준: 이름 트림 후 동일 (people 테이블에 개별 연락처 컬럼이 없으므로 이름 기준)

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").trim();
const normName = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").trim();
// 교회명 정규화: 공백 제거 + 끝의 "교회" 제거 (중간이 아닌 마지막 접미사만)
const normChurchName = (s: string | null | undefined) => {
  const base = norm(s);
  return base.endsWith("교회") ? base.slice(0, -2) : base;
};

export type ChurchLike = {
  id: string;
  name: string | null;
  denomination: string | null;
  contact_name?: string | null;
  phone?: string | null;
  created_at?: string | null;
  source?: string | null;
};

export type PersonLike = {
  church_id: string;
  name: string | null;
};

export type DuplicateGroup = {
  key: string;
  name: string;
  denomination: string;
  churches: {
    church: ChurchLike;
    peopleCount: number;
    overlappingNames: string[];
  }[];
};

export function findDuplicateGroups(
  churches: ChurchLike[],
  people: PersonLike[],
): DuplicateGroup[] {
  const peopleByChurch = new Map<string, Set<string>>();
  const namesByChurch = new Map<string, string[]>();
  for (const p of people) {
    const n = normName(p.name);
    if (!n) continue;
    if (!peopleByChurch.has(p.church_id)) {
      peopleByChurch.set(p.church_id, new Set());
      namesByChurch.set(p.church_id, []);
    }
    const set = peopleByChurch.get(p.church_id)!;
    if (!set.has(n)) {
      set.add(n);
      namesByChurch.get(p.church_id)!.push((p.name ?? "").trim());
    }
  }

  // 그룹핑 키: 정규화된 교회명(끝의 "교회" 제거) 기준.
  // 교단이 비어 있거나 다르더라도 이름이 같으면 같은 후보 그룹으로 묶는다.
  // (실제 동일 교회 여부는 겹치는 명단으로 최종 확인)
  const groups = new Map<string, ChurchLike[]>();
  for (const c of churches) {
    const n = normChurchName(c.name);
    if (!n) continue;
    const key = n;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(c);
  }

  const result: DuplicateGroup[] = [];
  for (const [key, list] of groups) {
    if (list.length < 2) continue;
    // find pairs with >=2 overlap; keep churches involved in any such pair
    const involved = new Set<string>();
    const overlapMap = new Map<string, Set<string>>(); // churchId -> overlapping names
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]; const b = list[j];
        const sa = peopleByChurch.get(a.id) ?? new Set();
        const sb = peopleByChurch.get(b.id) ?? new Set();
        const shared: string[] = [];
        for (const n of sa) if (sb.has(n)) shared.push(n);
        if (shared.length >= 2) {
          involved.add(a.id); involved.add(b.id);
          if (!overlapMap.has(a.id)) overlapMap.set(a.id, new Set());
          if (!overlapMap.has(b.id)) overlapMap.set(b.id, new Set());
          for (const n of shared) {
            overlapMap.get(a.id)!.add(n);
            overlapMap.get(b.id)!.add(n);
          }
        }
      }
    }
    if (involved.size < 2) continue;
    const involvedList = list.filter((c) => involved.has(c.id));
    // 그룹 라벨: 첫 항목의 원본 이름/교단(참고용). 실제 각 교회의 교단은 카드에 그대로 표시됨.
    const displayName = involvedList[0]?.name ?? list[0].name ?? key;
    const denoms = Array.from(new Set(involvedList.map((c) => (c.denomination ?? "").trim()).filter(Boolean)));
    const displayDenom = denoms.length === 1 ? denoms[0] : denoms.length > 1 ? denoms.join(" / ") : "";
    result.push({
      key,
      name: displayName,
      denomination: displayDenom,
      churches: list
        .filter((c) => involved.has(c.id))
        .map((c) => {
          const overlapSet = overlapMap.get(c.id) ?? new Set();
          const originalNames = namesByChurch.get(c.id) ?? [];
          const overlappingNames = originalNames.filter((n) => overlapSet.has(normName(n)));
          return {
            church: c,
            peopleCount: (peopleByChurch.get(c.id) ?? new Set()).size,
            overlappingNames,
          };
        }),
    });
  }
  return result;
}

// 입력 시점: 신규/편집 중인 폼과 기존 교회들 비교
export function findDuplicateForInput(params: {
  editingId: string | null;
  formName: string;
  formDenomination: string;
  formPersonNames: string[];
  churches: ChurchLike[];
  people: PersonLike[];
}): { church: ChurchLike; overlapCount: number; overlappingNames: string[] } | null {
  const n = normChurchName(params.formName);
  if (!n) return null;
  const formSet = new Set(params.formPersonNames.map(normName).filter(Boolean));
  if (formSet.size < 2) return null;

  const peopleByChurch = new Map<string, string[]>();
  for (const p of params.people) {
    const nn = normName(p.name);
    if (!nn) continue;
    if (!peopleByChurch.has(p.church_id)) peopleByChurch.set(p.church_id, []);
    peopleByChurch.get(p.church_id)!.push(nn);
  }

  let best: { church: ChurchLike; overlapCount: number; overlappingNames: string[] } | null = null;
  for (const c of params.churches) {
    if (params.editingId && c.id === params.editingId) continue;
    // 이름(정규화, 끝 "교회" 제거) 일치만으로 후보. 교단은 비교하지 않음.
    if (normChurchName(c.name) !== n) continue;
    const existing = new Set(peopleByChurch.get(c.id) ?? []);
    const overlap: string[] = [];
    for (const fn of formSet) if (existing.has(fn)) overlap.push(fn);
    if (overlap.length >= 2 && (!best || overlap.length > best.overlapCount)) {
      best = { church: c, overlapCount: overlap.length, overlappingNames: overlap };
    }
  }
  return best;
}
