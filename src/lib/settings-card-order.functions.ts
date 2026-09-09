// 설정 화면 카드 순서 저장 — 서버에서 전체관리자 권한을 재확인한 뒤 저장한다.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const schema = z.object({
  password: z.string().min(1),
  seasonId: z.string().uuid(),
  order: z.array(z.string().max(60)).max(50),
});

export const saveSettingsCardOrderServer = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: role, error } = await supabaseAdmin.rpc("verify_password", { p: data.password });
    if (error) throw new Error("권한 확인에 실패했습니다.");
    if (role !== "admin") throw new Error("전체관리자만 카드 순서를 저장할 수 있습니다.");

    const { error: upErr } = await supabaseAdmin.from("app_settings").upsert({
      season_id: data.seasonId,
      settings_card_order: data.order,
    } as never);
    if (upErr) throw new Error("카드 순서 저장에 실패했습니다.");
    return { ok: true };
  });
