// 공유 비밀번호를 세션 동안만 보관한다.
// 서버 함수(방식 B)에서 역할을 재검증하기 위해 필요하며, 탭을 닫으면 사라진다.
const KEY = "hdr_session_pw";

export function setSessionPassword(pw: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, pw);
  } catch {
    // sessionStorage 차단 시 무시 (관리 화면에서 재입력 요청)
  }
}

export function getSessionPassword(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function clearSessionPassword() {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // ignore
  }
}
