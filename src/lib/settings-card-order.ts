// 설정 화면 카드 순서 (app_settings.settings_card_order 에 시즌별로 저장).
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { getSessionPassword } from "@/lib/session-password";
import { saveSettingsCardOrderServer } from "@/lib/settings-card-order.functions";

/** 카드 식별자 — 기본 표시 순서 */
export const DEFAULT_SETTINGS_CARD_ORDER: string[] = [
  "apply-link",
  "seasons",
  "lodgings",
  "places",
  "bath-price",
  "fee",
  "receipt",
  "password",
  "ocr",
  "dashboard-order",
  "nav-menu",
];

export function sanitizeCardOrder(raw: unknown, known: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string" && known.includes(v) && !seen.has(v)) {
        seen.add(v);
        out.push(v);
      }
    }
  }
  for (const k of known) if (!seen.has(k)) out.push(k);
  return out;
}

export function useSettingsCardOrder(seasonId?: string) {
  return useQuery({
    queryKey: ["settings_card_order", seasonId],
    enabled: !!seasonId,
    staleTime: 60_000,
    queryFn: async (): Promise<string[]> => {
      const { data } = await supabase
        .from("app_settings")
        .select("*")
        .eq("season_id", seasonId!)
        .maybeSingle();
      return sanitizeCardOrder(
        (data as { settings_card_order?: unknown } | null)?.settings_card_order,
        DEFAULT_SETTINGS_CARD_ORDER,
      );
    },
  });
}

export function useSaveSettingsCardOrder(seasonId?: string) {
  const qc = useQueryClient();
  const saveServer = useServerFn(saveSettingsCardOrderServer);
  return useMutation({
    mutationFn: async (order: string[]) => {
      if (!seasonId) throw new Error("시즌이 없습니다");
      const clean = sanitizeCardOrder(order, DEFAULT_SETTINGS_CARD_ORDER);
      const password = getSessionPassword();
      if (password) {
        await saveServer({ data: { password, seasonId, order: clean } });
        return;
      }
      const { error } = await supabase
        .from("app_settings")
        .upsert({ season_id: seasonId, settings_card_order: clean } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings_card_order"] });
    },
  });
}
