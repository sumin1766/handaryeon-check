const PREFIX = "handaryeon:query-cache:";
const TTL_MS = 2 * 60 * 60 * 1000;

type CacheBox<T> = {
  ts: number;
  data: T;
};

function cacheKey(parts: readonly unknown[]) {
  return `${PREFIX}${JSON.stringify(parts)}`;
}

export function readCachedData<T>(parts: readonly unknown[]): T | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const raw = window.sessionStorage.getItem(cacheKey(parts));
    if (!raw) return undefined;
    const box = JSON.parse(raw) as CacheBox<T>;
    if (!box || Date.now() - box.ts > TTL_MS) {
      window.sessionStorage.removeItem(cacheKey(parts));
      return undefined;
    }
    return box.data;
  } catch {
    return undefined;
  }
}

export function writeCachedData<T>(parts: readonly unknown[], data: T) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(cacheKey(parts), JSON.stringify({ ts: Date.now(), data }));
  } catch {
    // Storage can be full or blocked. The in-memory query cache still works.
  }
}

export function resilientQueryCache<T>(parts: readonly unknown[]) {
  return {
    initialData: () => readCachedData<T>(parts),
    placeholderData: (previousData: T | undefined) => previousData ?? readCachedData<T>(parts),
    gcTime: TTL_MS,
  };
}