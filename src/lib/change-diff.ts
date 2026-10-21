// 변경 이력용 참석자 단위 Diff (순수 모듈, 클라이언트/서버 공용).
import { CATEGORY_PEOPLE_MAP, categoryLabel } from "./member-categories";

export type DiffMember = {
  key?: string | null;
  name: string;
  phone?: string | null;
  category?: string | null;
  lodging?: string | null;
  note?: string | null;
};

export type ChangeActor = "admin" | "staff" | "user" | null;

export function actorLabel(actor: string | null | undefined): string {
  if (actor === "admin") return "전체관리자 수정";
  if (actor === "staff") return "접수 담당자 수정";
  if (actor === "user") return "사용자(본인) 수정";
  return "수정";
}

const LODGING: Record<string, string> = { church: "교회숙박", external: "외부숙박", none: "비숙박" };
export const lodgingLabel = (v: string) => LODGING[v] ?? v;

const t = (v: string | null | undefined) => (v ?? "").trim();

/** before/after 명단 비교 → 사람이 읽는 변경 문장 목록. 행 키 우선, 없으면 이름으로 짝짓는다. */
export function diffMembers(before: DiffMember[], after: DiffMember[]): string[] {
  const out: string[] = [];
  const pool = [...before];
  const pairs: [DiffMember, DiffMember][] = [];
  const added: DiffMember[] = [];
  const unmatched: DiffMember[] = [];
  for (const a of after) {
    const i = a.key ? pool.findIndex((b) => b.key && b.key === a.key) : -1;
    if (i >= 0) pairs.push([pool.splice(i, 1)[0]!, a]);
    else unmatched.push(a);
  }
  for (const a of unmatched) {
    const i = pool.findIndex((b) => t(b.name) === t(a.name));
    if (i >= 0) pairs.push([pool.splice(i, 1)[0]!, a]);
    else added.push(a);
  }
  for (const [b, a] of pairs) {
    const who = t(a.name) || t(b.name);
    if (t(b.name) !== t(a.name)) out.push(`참석자 '${t(b.name)}' → '${t(a.name)}' 이름 변경`);
    if (a.phone !== undefined && t(b.phone) !== t(a.phone))
      out.push(`${who}: 전화번호 '${t(b.phone) || "-"}' → '${t(a.phone) || "-"}' 변경`);
    if (a.category !== undefined && t(b.category) !== t(a.category))
      out.push(`${who}: 분류 '${categoryLabel(t(b.category))}' → '${categoryLabel(t(a.category))}' 변경`);
    if (a.lodging !== undefined && t(b.lodging) !== t(a.lodging))
      out.push(`${who}: 숙박 '${lodgingLabel(t(b.lodging))}' → '${lodgingLabel(t(a.lodging))}' 변경`);
    if (a.note !== undefined && t(b.note) !== t(a.note))
      out.push(`${who}: 비고 '${t(b.note) || "-"}' → '${t(a.note) || "-"}' 변경`);
  }
  for (const a of added) out.push(`참석자 '${t(a.name)}' 추가`);
  for (const b of pool) out.push(`참석자 '${t(b.name)}' 삭제`);
  return out;
}

/** 운영 people 행 → 표시용 사전접수 형식 (분류·숙박·전화번호를 비고에서 역추출). */
export function personToMember(p: {
  gender: string;
  age_group: string;
  lodging: boolean;
  note: string | null;
}): { category: string; lodging_type: string; phone: string | null; note: string | null } {
  const tokens = (p.note ?? "").split("·").map((s) => s.trim()).filter(Boolean);
  let catNote = "";
  let external = false;
  let phone: string | null = null;
  const rest: string[] = [];
  const catNotes = new Set(Object.values(CATEGORY_PEOPLE_MAP).map((m) => m.note).filter(Boolean) as string[]);
  for (const tk of tokens) {
    if (!catNote && catNotes.has(tk)) catNote = tk;
    else if (tk === "외부숙박") external = true;
    else if (!phone && /^[0-9-]{9,13}$/.test(tk)) phone = tk.replace(/-/g, "");
    else rest.push(tk);
  }
  const hit = Object.entries(CATEGORY_PEOPLE_MAP).find(
    ([k, m]) => !k.endsWith("_child") && m.gender === p.gender && m.age_group === p.age_group && (m.note ?? "") === catNote,
  );
  const category =
    hit?.[0] ??
    (p.gender === "F" ? (p.age_group === "adult" ? "female_adult" : "female_student") : p.age_group === "adult" ? "male_adult" : "male_student");
  return {
    category,
    lodging_type: p.lodging ? "church" : external ? "external" : "none",
    phone,
    note: rest.length ? rest.join(" · ") : null,
  };
}

/** 병합 교회 건별 색상 — 파스텔 팔레트를 신청 시각 순으로 순환 배정 (인접 색상 대비 확보). */
export const BATCH_COLOR_COUNT = 8;
export function batchColorIndex(sortedIds: string[], id: string | null | undefined): number | null {
  if (!id || sortedIds.length < 2) return null;
  const i = sortedIds.indexOf(id);
  return i < 0 ? null : i % BATCH_COLOR_COUNT;
}
