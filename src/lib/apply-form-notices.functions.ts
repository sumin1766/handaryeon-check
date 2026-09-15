// 공개 사전접수 폼(/apply) 상단 안내 문구 관리 (방식 B — 서버에서 권한 재확인).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

async function requireAdmin(password: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: role, error } = await supabaseAdmin.rpc("verify_password", { p: password });
  if (error) throw new Error("권한 확인에 실패했습니다.");
  if (role !== "admin") throw new Error("전체관리자만 수정할 수 있습니다.");
  return supabaseAdmin;
}

function cleanNotices(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .slice(0, 30);
}

/** 관리자 화면에서 현재 안내 문구 조회 */
export const getApplyFormNotices = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ password: z.string().min(1), seasonId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }): Promise<string[]> => {
    const db = await requireAdmin(data.password);
    const { data: row } = await db
      .from("app_settings")
      .select("*")
      .eq("season_id", data.seasonId)
      .maybeSingle();
    return cleanNotices((row as { apply_form_notices?: unknown } | null)?.apply_form_notices);
  });

/** 안내 문구 저장 — 활성 시즌에만 적용 */
export const saveApplyFormNotices = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        password: z.string().min(1),
        seasonId: z.string().uuid(),
        notices: z.array(z.string().max(500)).max(30),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ notices: string[] }> => {
    const db = await requireAdmin(data.password);

    const { data: season } = await db
      .from("seasons")
      .select("is_active")
      .eq("id", data.seasonId)
      .maybeSingle();
    if (!season?.is_active) throw new Error("활성 시즌에서만 수정할 수 있습니다.");

    const notices = cleanNotices(data.notices);
    const { error } = await db
      .from("app_settings")
      .upsert({ season_id: data.seasonId, apply_form_notices: notices } as never);
    if (error) throw new Error("안내 문구 저장에 실패했습니다.");
    return { notices };
  });
