// 스프레드시트 수식 인젝션 방지: 내보내기 직전에만 적용하는 공용 셀 정제.
// =, +, -, @, 탭, CR로 시작하는 문자열 앞에만 '를 붙여 수식 실행을 막는다.
// 숫자 타입(인원수·금액)과 정상 전화번호는 그대로 둔다.
export function sanitizeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "number") return String(value);
  const s = String(value);
  return /^\s*[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
