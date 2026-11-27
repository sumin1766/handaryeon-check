// 확정/재확정 시 people.note 재작성 규칙.
// note에는 시스템 토큰(분류 표기·외부숙박·전화번호)과 직원 자유 비고가 " · "로 함께 저장된다.
// 재확정 때는 시스템 토큰만 신청자 값으로 다시 쓰고, 직원 자유 비고(rest)는 순서대로 보존한다.
import { CATEGORY_PEOPLE_MAP } from "./member-categories";

const SEP = " · ";
const CATEGORY_NOTES = new Set(
  Object.values(CATEGORY_PEOPLE_MAP)
    .map((m) => m.note)
    .filter((v): v is string => !!v),
);

/** 전화번호로만 이루어진 토큰(숫자 9자리 이상, 숫자·하이픈·공백·괄호·+ 만 포함). */
export function isPhoneToken(t: string): boolean {
  return /^[0-9+\-\s()]+$/.test(t) && t.replace(/[^0-9]/g, "").length >= 9;
}

export function isSystemNoteToken(t: string): boolean {
  return CATEGORY_NOTES.has(t) || t === "외부숙박" || isPhoneToken(t);
}

/** 신규 INSERT용 시스템 토큰 목록(기존 toRow 순서 그대로). */
export function systemNoteTokens(input: { categoryNote?: string | undefined; external: boolean; phone: string | null | undefined }): string[] {
  const out: string[] = [];
  if (input.categoryNote) out.push(input.categoryNote);
  if (input.external) out.push("외부숙박");
  if (input.phone) out.push(input.phone);
  return out;
}

/** 기존 note에서 직원 자유 비고만 추출. */
export function staffNoteRest(existing: string | null | undefined): string[] {
  if (!existing) return [];
  return existing
    .split(SEP)
    .map((t) => t.trim())
    .filter((t) => t && !isSystemNoteToken(t));
}

/** 재확정 UPDATE용: 새 시스템 토큰 + 보존된 직원 비고. */
export function rewriteNote(existing: string | null | undefined, system: string[]): string | null {
  const parts = [...system, ...staffNoteRest(existing)];
  return parts.length ? parts.join(SEP) : null;
}
