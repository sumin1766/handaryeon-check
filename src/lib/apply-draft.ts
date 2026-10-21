// 사전접수 폼 임시저장(브라우저 localStorage 전용). 서버로 전송하지 않는다.
export const DRAFT_TTL_MS = 72 * 60 * 60 * 1000;
const PREFIX = "handaryeon:apply-draft:";

export type ApplyDraftData = {
  consented: boolean;
  churchName: string;
  denomination: string;
  managerName: string;
  managerPhone: string;
  region: { sido: string; sigungu: string; road: string };
  rows: { name: string; phone: string; lodging_type: string; category: string }[];
};
export type ApplyDraft = { savedAt: number; data: ApplyDraftData };

export const draftKey = (seasonId: string) => `${PREFIX}${seasonId}`;

export function isDraftExpired(savedAt: number, now: number): boolean {
  return !Number.isFinite(savedAt) || now - savedAt > DRAFT_TTL_MS;
}

/** 저장된 문자열을 해석. 만료·손상이면 null. */
export function parseDraft(raw: string | null, now: number): ApplyDraft | null {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw) as ApplyDraft;
    if (!d || typeof d.savedAt !== "number" || !d.data) return null;
    if (isDraftExpired(d.savedAt, now)) return null;
    return d;
  } catch {
    return null;
  }
}

export function hasDraftContent(d: ApplyDraftData): boolean {
  return (
    !!(d.churchName || d.denomination || d.managerName || d.managerPhone) ||
    !!(d.region.sido || d.region.road) ||
    d.rows.some((r) => r.name.trim() || r.phone.trim())
  );
}

export function loadDraft(seasonId: string): ApplyDraft | null {
  if (typeof window === "undefined") return null;
  const key = draftKey(seasonId);
  const raw = window.localStorage.getItem(key);
  const d = parseDraft(raw, Date.now());
  if (raw && !d) window.localStorage.removeItem(key); // 만료/손상 폐기
  return d;
}

export function saveDraft(seasonId: string, data: ApplyDraftData) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(draftKey(seasonId), JSON.stringify({ savedAt: Date.now(), data }));
  } catch {
    /* 저장 공간 부족 등은 무시 */
  }
}

export function clearDraft(seasonId: string) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(seasonId));
}

/** 다른 시즌의 임시저장은 모두 제거 */
export function purgeOtherSeasonDrafts(seasonId: string) {
  if (typeof window === "undefined") return;
  const keep = draftKey(seasonId);
  for (let i = window.localStorage.length - 1; i >= 0; i--) {
    const k = window.localStorage.key(i);
    if (k && k.startsWith(PREFIX) && k !== keep) window.localStorage.removeItem(k);
  }
}
