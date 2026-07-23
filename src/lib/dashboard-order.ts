import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type DashboardSectionKey = "pre" | "segue" | "actual";

export const DEFAULT_DASHBOARD_ORDER: DashboardSectionKey[] = ["pre", "segue", "actual"];

export const DASHBOARD_SECTION_LABEL: Record<DashboardSectionKey, string> = {
  pre: "사전접수 현황",
  segue: "세계로교회 · 외부교회 집계",
  actual: "실접수 현황",
};

/** Sanitize a raw string[] from DB into a valid, complete ordered key list. */
export function sanitizeOrder(raw: unknown): DashboardSectionKey[] {
  const seen = new Set<DashboardSectionKey>();
  const out: DashboardSectionKey[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if ((v === "pre" || v === "segue" || v === "actual") && !seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
  }
  for (const k of DEFAULT_DASHBOARD_ORDER) if (!seen.has(k)) out.push(k);
  return out;
}

export function useDashboardOrder(seasonId?: string) {
  return useQuery({
    queryKey: ["dashboard_order", seasonId],
    enabled: !!seasonId,
    queryFn: async () => {
      const { data } = await supabase
        .from("app_settings")
        .select("dashboard_section_order")
        .eq("season_id", seasonId!)
        .maybeSingle();
      return sanitizeOrder((data as any)?.dashboard_section_order);
    },
  });
}

export function useSaveDashboardOrder(seasonId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (order: DashboardSectionKey[]) => {
      if (!seasonId) throw new Error("시즌이 없습니다");
      const { error } = await supabase
        .from("app_settings")
        .upsert({ season_id: seasonId, dashboard_section_order: order } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["dashboard_order"] });
    },
  });
}
