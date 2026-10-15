// 현재(활성) 시즌 초기화 — 전체관리자 전용 (방식 B: 서버에서 권한·대상 재확인).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { RESET_ITEMS } from "./season-reset";

const ITEM_KEYS = [...RESET_ITEMS.map((i) => i.key), "all"] as [string, ...string[]];

export const resetSeasonItem = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        password: z.string().min(1),
        seasonId: z.string().uuid(),
        item: z.enum(ITEM_KEYS),
        confirmName: z.string(),
        confirmPassword: z.string().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: role } = await db.rpc("verify_password", { p: data.password });
    if (role !== "admin") throw new Error("전체관리자만 초기화할 수 있습니다.");

    const { data: season } = await db
      .from("seasons")
      .select("id, name, is_active")
      .eq("id", data.seasonId)
      .maybeSingle();
    if (!season) throw new Error("시즌을 찾을 수 없습니다.");
    if (!season.is_active) throw new Error("현재(활성) 시즌만 초기화할 수 있습니다.");
    if (data.confirmName !== season.name) throw new Error("시즌 이름이 일치하지 않습니다.");

    if (data.item === "all") {
      const { data: r2 } = await db.rpc("verify_password", { p: data.confirmPassword ?? "" });
      if (r2 !== "admin") throw new Error("관리자 비밀번호가 올바르지 않습니다.");
    }

    const { error } = await db.rpc("reset_season_items" as never, {
      p_season: season.id,
      p_items: [data.item],
    } as never);
    if (error) throw new Error("초기화에 실패했습니다.");
    return { ok: true };
  });
