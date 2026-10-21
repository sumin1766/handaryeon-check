// 명단 수정 페이지용 순수 모듈: 분류↔운영 people 필드 변환, 숙박 집계, 변경 요약.
// 비고 저장 형식은 사전접수 확정 시와 동일(분류 메모 · 외부숙박 · 전화번호 · 비고)하게 맞춘다.
import { CATEGORY_PEOPLE_MAP, feeForCategory, type CategoryFeeMap, type AnyMemberCategory } from "./member-categories";
import { diffMembers, personToMember } from "./change-diff";

export type RosterPerson = {
  id: string;
  name: string;
  note: string | null;
  gender: string;
  age_group: string;
  lodging: boolean;
  pre_registration_id: string | null;
  created_at?: string | null;
};

/** 편집용 행 (화면 형식) */
export type RosterRow = {
  key: string;
  id: string | null;
  name: string;
  phone: string;
  category: string;
  lodging_type: "church" | "external" | "none";
  note: string;
  pre_registration_id: string | null;
};

export function personToRow(p: RosterPerson): RosterRow {
  const m = personToMember(p);
  return {
    key: p.id,
    id: p.id,
    name: p.name ?? "",
    phone: m.phone ?? "",
    category: m.category,
    lodging_type: m.lodging_type as RosterRow["lodging_type"],
    note: m.note ?? "",
    pre_registration_id: p.pre_registration_id ?? null,
  };
}

/** 화면 행 → people 저장 필드 */
export function rowToPersonFields(r: Pick<RosterRow, "name" | "phone" | "category" | "lodging_type" | "note">) {
  const map = CATEGORY_PEOPLE_MAP[r.category as AnyMemberCategory] ?? CATEGORY_PEOPLE_MAP.male_adult;
  const notes: string[] = [];
  if (map.note) notes.push(map.note);
  if (r.lodging_type === "external") notes.push("외부숙박");
  const phone = r.phone.replace(/\D/g, "");
  if (phone) notes.push(phone);
  if (r.note.trim()) notes.push(r.note.trim());
  return {
    name: r.name.trim(),
    gender: map.gender,
    age_group: map.age_group,
    lodging: r.lodging_type === "church",
    note: notes.length ? notes.join(" · ") : null,
  };
}

/** 숙박(교회숙박) / 비숙박 / 전체 인원 */
export function lodgingCounts(people: { lodging: boolean }[]) {
  const lodging = people.filter((p) => p.lodging).length;
  return { lodging, nonLodging: people.length - lodging, total: people.length };
}

/** 주소 표시: 시·도 + 시·군·구까지만 */
export function shortAddress(a: { sido: string; sigungu: string } | null | undefined): string {
  return a ? [a.sido, a.sigungu].filter(Boolean).join(" ") : "";
}

export function rowsFee(rows: { category: string }[], fees: CategoryFeeMap, preRegFee: number) {
  return rows.reduce((s, r) => s + feeForCategory(r.category, fees, preRegFee), 0);
}

/** 저장 전 변경 요약: 항목별 Diff + 인원·회비 증감 */
export function summarizeRosterChange(before: RosterRow[], after: RosterRow[], fees: CategoryFeeMap, preRegFee: number) {
  const conv = (r: RosterRow) => ({ key: r.id, name: r.name, phone: r.phone, category: r.category, lodging: r.lodging_type, note: r.note });
  const kept = after.filter((r) => r.name.trim());
  const lines = diffMembers(before.map(conv), kept.map(conv));
  const countDelta = kept.length - before.length;
  const feeDelta = rowsFee(kept, fees, preRegFee) - rowsFee(before, fees, preRegFee);
  return { lines, countDelta, feeDelta, changed: lines.length > 0 };
}
