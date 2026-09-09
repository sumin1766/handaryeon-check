// Paginated fetch helper — PostgREST caps single responses at 1000 rows.
// Use for any query that may exceed that (e.g. `people` across all churches).
//
// IMPORTANT: `.range()` pagination is only stable when the query has a
// deterministic ORDER BY. Without it, PostgREST/Postgres may return rows in
// different orders across pages, causing duplicates and silent omissions once
// the result set exceeds 1000 rows. We ALWAYS append `.order("id")` as a
// final tiebreaker so every call site is safe by default. Callers that pass
// their own `.order(...)` still win as the primary sort — additional
// `.order()` calls chain as secondary sort keys, so their intent is preserved.
import { sdb } from "@/lib/secure-db";

const PAGE = 1000;

type Table =
  | "people"
  | "churches"
  | "lodgings"
  | "bath_coupons"
  | "duplicate_dismissals"
  | "places"
  | "church_payments"
  // 사전접수(참석자 사전신청) — 관리자 조회용
  | "pre_registrations"
  | "pre_registration_members"
  | "pre_registration_changes";

export async function fetchAll<T = any>(
  table: Table,
  build: (q: any) => any,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const q = build(sdb.from(table))
      .order("id")
      .range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
