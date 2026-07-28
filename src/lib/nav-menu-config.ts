import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Nav menu (top tab) order + hidden config, persisted in
 * app_settings.nav_menu_order / nav_menu_hidden.
 *
 * Paths here are TanStack Router paths — same strings used in
 * app-shell.tsx TABS[i].to.
 */

/** Default full order — matches the original TABS[] declaration order. */
export const DEFAULT_NAV_ORDER: string[] = [
  "/",
  "/pre-registration",
  "/intake-sheet",
  "/registry",
  "/onsite",
  "/lodgings",
  "/places",
  "/nametags",
  "/rosters",
  "/bath-coupons",
  "/receipt",
  "/settings",
];

/**
 * Paths that must never be hidden, otherwise the admin would lose access
 * to the very screen that manages this setting. Dashboard is kept because
 * the header logo/link and default landing route point there.
 */
export const NAV_PROTECTED_PATHS: ReadonlySet<string> = new Set(["/", "/settings"]);

export function sanitizeNavOrder(raw: unknown, known: string[]): string[] {
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
  for (const p of known) if (!seen.has(p)) out.push(p);
  return out;
}

export function sanitizeNavHidden(raw: unknown, known: string[]): string[] {
  const seen = new Set<string>();
  if (Array.isArray(raw)) {
    for (const v of raw) {
      if (typeof v === "string" && known.includes(v) && !NAV_PROTECTED_PATHS.has(v)) {
        seen.add(v);
      }
    }
  }
  return Array.from(seen);
}

export interface NavMenuConfig {
  order: string[];
  hidden: string[];
}

export function useNavMenuConfig(seasonId?: string) {
  return useQuery({
    queryKey: ["nav_menu_config", seasonId],
    enabled: !!seasonId,
    staleTime: 60_000,
    queryFn: async (): Promise<NavMenuConfig> => {
      const { data } = await supabase
        .from("app_settings")
        .select("nav_menu_order, nav_menu_hidden")
        .eq("season_id", seasonId!)
        .maybeSingle();
      const order = sanitizeNavOrder((data as any)?.nav_menu_order, DEFAULT_NAV_ORDER);
      const hidden = sanitizeNavHidden((data as any)?.nav_menu_hidden, DEFAULT_NAV_ORDER);
      return { order, hidden };
    },
  });
}

export function useSaveNavMenuConfig(seasonId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: NavMenuConfig) => {
      if (!seasonId) throw new Error("시즌이 없습니다");
      const order = sanitizeNavOrder(cfg.order, DEFAULT_NAV_ORDER);
      const hidden = sanitizeNavHidden(cfg.hidden, DEFAULT_NAV_ORDER);
      const { error } = await supabase
        .from("app_settings")
        .upsert({
          season_id: seasonId,
          nav_menu_order: order,
          nav_menu_hidden: hidden,
        } as any);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["nav_menu_config"] });
    },
  });
}

/** Apply saved order + hidden to a role-filtered tab list. */
export function applyNavConfig<T extends { to: string }>(
  tabs: readonly T[],
  cfg: NavMenuConfig | undefined,
): T[] {
  const order = cfg?.order ?? DEFAULT_NAV_ORDER;
  const hidden = new Set(cfg?.hidden ?? []);
  const byPath = new Map(tabs.map((t) => [t.to, t]));
  const out: T[] = [];
  for (const p of order) {
    const t = byPath.get(p);
    if (t && !hidden.has(p)) out.push(t);
  }
  // Any role-visible tabs not present in order (e.g. new tab added after
  // save) get appended at the end so nothing disappears silently.
  for (const t of tabs) {
    if (!order.includes(t.to) && !hidden.has(t.to)) out.push(t);
  }
  return out;
}
