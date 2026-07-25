// 중복 교회 감지 유틸
// 규칙:
// - 정규화된 교회명(끝의 "교회" 제거, 공백 제거)이 같거나, 한쪽이 다른 쪽에 부분 문자열로 포함되면 후보로 묶음
//   (부분 일치는 최소 2자 이상일 때만 성립하여 과도한 오탐 방지)
// - 후보로 묶인 뒤, 겹치는 사람 이름이 2명 이상인 pair만 실제 중복으로 표시
// - 사용자가 "중복 아님"으로 무시한 pair(dismissedPairs)는 제외
// - 삭제/무시는 자동으로 하지 않으며, 사용자가 직접 처리

const norm = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").trim();
const normName = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, "").trim();
// 교회명 정규화: 공백 제거 + 끝의 "교회" 제거 (중간이 아닌 마지막 접미사만)
const normChurchName = (s: string | null | undefined) => {
  const base = norm(s);
  return base.endsWith("교회") ? base.slice(0, -2) : base;
};

// 부분 문자열 일치 최소 글자 수 (짧은 이름으로 인한 과오탐 방지)
const MIN_SUBSTR_LEN = 2;

export function pairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

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

// Union-Find
class UF {
  parent = new Map<string, string>();
  find(x: string): string {
    if (!this.parent.has(x)) { this.parent.set(x, x); return x; }
    let cur = x;
    while (this.parent.get(cur)! !== cur) cur = this.parent.get(cur)!;
    // path compression
    let it = x;
    while (this.parent.get(it)! !== cur) {
      const next = this.parent.get(it)!;
      this.parent.set(it, cur);
      it = next;
    }
    return cur;
  }
  union(a: string, b: string) {
    const ra = this.find(a); const rb = this.find(b);
    if (ra !== rb) this.parent.set(ra, rb);
  }
}

export function findDuplicateGroups(
  churches: ChurchLike[],
  people: PersonLike[],
  dismissedPairs?: Set<string> | null,
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

  // 1) 정규화된 이름 기반 초기 후보 그룹
  const byExact = new Map<string, ChurchLike[]>();
  for (const c of churches) {
    const n = normChurchName(c.name);
    if (!n) continue;
    if (!byExact.has(n)) byExact.set(n, []);
    byExact.get(n)!.push(c);
  }

  // 2) 부분 문자열 일치로 그룹 키 병합
  const uf = new UF();
  const keys = Array.from(byExact.keys());
  for (const k of keys) uf.find(k);
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j];
      const shorter = a.length <= b.length ? a : b;
      const longer = a.length <= b.length ? b : a;
      if (shorter.length < MIN_SUBSTR_LEN) continue;
      if (longer.includes(shorter)) uf.union(a, b);
    }
  }
  const merged = new Map<string, ChurchLike[]>();
  for (const [k, list] of byExact) {
    const root = uf.find(k);
    if (!merged.has(root)) merged.set(root, []);
    merged.get(root)!.push(...list);
  }

  const dismissed = dismissedPairs ?? new Set<string>();

  const result: DuplicateGroup[] = [];
  for (const [key, list] of merged) {
    if (list.length < 2) continue;
    const involved = new Set<string>();
    const overlapMap = new Map<string, Set<string>>();
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = list[i]; const b = list[j];
        if (dismissed.has(pairKey(a.id, b.id))) continue;
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
    const displayName = involvedList[0]?.name ?? list[0].name ?? key;
    const denoms = Array.from(new Set(involvedList.map((c) => (c.denomination ?? "").trim()).filter(Boolean)));
    const displayDenom = denoms.length === 1 ? denoms[0] : denoms.length > 1 ? denoms.join(" / ") : "";
    result.push({
      key,
      name: displayName,
      denomination: displayDenom,
      churches: involvedList.map((c) => {
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
  dismissedPairs?: Set<string> | null;
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

  const dismissed = params.dismissedPairs ?? new Set<string>();

  let best: { church: ChurchLike; overlapCount: number; overlappingNames: string[] } | null = null;
  for (const c of params.churches) {
    if (params.editingId && c.id === params.editingId) continue;
    const cn = normChurchName(c.name);
    if (!cn) continue;
    // 완전 일치 또는 부분 문자열 일치(최소 2자)
    const shorter = cn.length <= n.length ? cn : n;
    const longer = cn.length <= n.length ? n : cn;
    const matches = cn === n || (shorter.length >= MIN_SUBSTR_LEN && longer.includes(shorter));
    if (!matches) continue;
    if (params.editingId && dismissed.has(pairKey(params.editingId, c.id))) continue;
    const existing = new Set(peopleByChurch.get(c.id) ?? []);
    const overlap: string[] = [];
    for (const fn of formSet) if (existing.has(fn)) overlap.push(fn);
    if (overlap.length >= 2 && (!best || overlap.length > best.overlapCount)) {
      best = { church: c, overlapCount: overlap.length, overlappingNames: overlap };
    }
  }
  return best;
}
