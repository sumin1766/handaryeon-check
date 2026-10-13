/** Display-only subtraction; church count comes from the shared regional query. */
export function duplicateSubmissionCount(confirmedCount: number, confirmedChurchCount: number) {
  return confirmedCount - confirmedChurchCount;
}

/** Exact matches only. Retain the representative submission so its star/actions remain unchanged. */
export function uniqueManagerDisplay<T extends { name: string; phone: string; preRegistrationId: string }>(
  managers: readonly T[],
  primaryId: string | null,
): T[] {
  const groups = new Map<string, T>();
  for (const manager of managers) {
    const key = JSON.stringify([manager.name, manager.phone]);
    if (!groups.has(key) || manager.preRegistrationId === primaryId) groups.set(key, manager);
  }
  return [...groups.values()];
}