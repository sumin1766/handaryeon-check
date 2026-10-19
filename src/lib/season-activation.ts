// Season activation (switching which season is active) is a season-level
// control, not an edit of a season's data. It must stay available even while
// the app is in view-only mode (past/finished season browsing).

type WriteRequest = { table: string; action: string; values?: unknown };

/**
 * True only for the exact write that switches the active season:
 * an UPDATE on `seasons` whose payload contains nothing but `is_active`.
 * Any other write (season name/dates, or any other table) stays blocked.
 */
export function isSeasonActivationWrite(req: WriteRequest): boolean {
  if (req.table !== "seasons" || req.action !== "update") return false;
  const v = req.values;
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  const keys = Object.keys(v);
  return keys.length === 1 && keys[0] === "is_active" && typeof (v as any).is_active === "boolean";
}
