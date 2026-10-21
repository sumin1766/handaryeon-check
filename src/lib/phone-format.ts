// 전화번호 화면 표시용 하이픈 포맷. 저장·제출 값은 숫자만 유지한다.
export function phoneDigits(v: string): string {
  return v.replace(/\D/g, "").slice(0, 11);
}

/** 표시용: 010-0000-0000 / 02-000-0000 등 */
export function formatPhone(v: string): string {
  const d = phoneDigits(v);
  if (d.startsWith("02")) {
    if (d.length <= 2) return d;
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, d.length - 4)}-${d.slice(-4)}`.replace(/-$/, "");
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (d.length <= 3) return d;
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
}

/** 자동 이동 기준: 휴대폰(01x) 11자리 완성 시에만. */
export function isPhoneComplete(v: string): boolean {
  const d = phoneDigits(v);
  return /^01\d/.test(d) && d.length === 11;
}

/** 010 고정 입력: 저장 값(숫자) → 뒤 8자리 표시 "0000-0000" */
export function phone010Tail(v: string): string {
  const d = phoneDigits(v);
  const t = (d.startsWith("010") ? d.slice(3) : d).slice(0, 8);
  return t.length > 4 ? `${t.slice(0, 4)}-${t.slice(4)}` : t;
}

/** 010 고정 입력: 뒤 자리 입력 → 저장 값. 뒤 자리가 비면 빈 값. */
export function phone010FromTail(tail: string): string {
  const t = tail.replace(/\D/g, "").slice(0, 8);
  return t ? `010${t}` : "";
}
