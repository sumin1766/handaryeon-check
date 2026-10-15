// 테스트 시즌 판별: 이름이 "__"로 시작하거나 "LOADTEST"를 포함하면 테스트 시즌.
export function isTestSeasonName(name: string | null | undefined): boolean {
  if (!name) return false;
  return name.startsWith("__") || name.includes("LOADTEST");
}

export const TEST_SEASON_MAINTENANCE_MESSAGE =
  "현재 시스템 점검 중으로 접수가 일시 중단되었습니다";

export const DEFAULT_APPLY_BLOCK_MESSAGE = "현재 사전접수가 중단되었습니다.";

/**
 * 공개 사전접수 차단 사유 판정. 테스트 시즌 점검이 수동 차단보다 우선한다.
 * 반환값이 null 이면 정상 접수.
 */
export function resolveApplyBlockMessage(opts: {
  isTestSeason: boolean;
  manualBlocked: boolean;
  manualMessage?: string | null;
}): string | null {
  if (opts.isTestSeason) return TEST_SEASON_MAINTENANCE_MESSAGE;
  if (opts.manualBlocked) {
    const m = (opts.manualMessage ?? "").trim();
    return m || DEFAULT_APPLY_BLOCK_MESSAGE;
  }
  return null;
}
