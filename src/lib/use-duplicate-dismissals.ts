import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchAll } from "@/lib/fetch-all";
import { useRealtimeInvalidate } from "@/lib/use-realtime";
import { pairKey } from "@/lib/duplicate-check";
import { toast } from "sonner";

export type DismissalRow = {
  id: string;
  season_id: string;
  church_a_id: string;
  church_b_id: string;
  note: string | null;
  created_at: string;
};

export function useDuplicateDismissals(seasonId: string | undefined) {
  const qc = useQueryClient();
  const key = ["duplicate_dismissals", seasonId];

  useRealtimeInvalidate(["duplicate_dismissals"], [key]);

  const { data: rows = [] } = useQuery({
    queryKey: key,
    enabled: !!seasonId,
    queryFn: async () => {
      const rows = await fetchAll<DismissalRow>("duplicate_dismissals" as any, (q) =>
        (q as any).select("*").eq("season_id", seasonId!),
      );
      return rows;
    },
  });

  const set = useMemo(
    () => new Set(rows.map((r) => pairKey(r.church_a_id, r.church_b_id))),
    [rows],
  );

  const dismiss = useMutation({
    mutationFn: async (payload: { a: string; b: string; note?: string }) => {
      if (!seasonId) throw new Error("시즌 정보가 없습니다.");
      const [a, b] = payload.a < payload.b ? [payload.a, payload.b] : [payload.b, payload.a];
      const { error } = await (supabase.from as any)("duplicate_dismissals").insert({
        season_id: seasonId,
        church_a_id: a,
        church_b_id: b,
        note: payload.note ?? null,
      });
      if (error && !/duplicate|unique/i.test(error.message)) throw error;
    },
    onSuccess: () => {
      toast.success("중복 아님으로 표시했습니다.");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message ?? "저장 실패"),
  });

  const restore = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase.from as any)("duplicate_dismissals").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("무시 해제되었습니다.");
      qc.invalidateQueries({ queryKey: key });
    },
    onError: (e: any) => toast.error(e.message ?? "해제 실패"),
  });

  return { rows, set, dismiss, restore };
}
