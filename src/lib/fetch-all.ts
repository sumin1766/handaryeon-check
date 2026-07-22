// Paginated fetch helper — PostgREST caps single responses at 1000 rows.
// Use for any query that may exceed that (e.g. `people` across all churches).
import { supabase } from "@/integrations/supabase/client";

const PAGE = 1000;

type Table = "people" | "churches" | "lodgings" | "bath_coupons";

export async function fetchAll<T = any>(
  table: Table,
  build: (q: ReturnType<typeof supabase.from>) => any,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const q = build(supabase.from(table)).range(from, from + PAGE - 1);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as T[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
