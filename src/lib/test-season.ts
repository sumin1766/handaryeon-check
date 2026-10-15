// 테스트 시즌 판별: 이름이 "__"로 시작하거나 "LOADTEST"를 포함하면 테스트 시즌.
export function isTestSeasonName(name: string | null | undefined): boolean {
  if (!name) return false;
  return name.startsWith("__") || name.includes("LOADTEST");
}

export const TEST_SEASON_MAINTENANCE_MESSAGE =
  "현재 시스템 점검 중으로 접수가 일시 중단되었습니다";
