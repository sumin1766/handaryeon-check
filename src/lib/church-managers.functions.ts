// 교회 ↔ 여러 사전접수(담당자) 관계 조회 및 대표 담당자 지정 (방식 B).
// 데이터는 삭제·병합하지 않는다. 대표 지정은 표시용 값(churches.primary_pre_registration_id)만 바꾼다.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type ChurchManager = {
  preRegistrationId: string;
  name: string;
  phone: string;
  status: string;
  headCount: number;
  createdAt: string;
};

export type ChurchManagerGroup = {
  churchId: string;
  primaryPreRegistrationId: string | null;
  managers: ChurchManager[];
};

async function requireRole(password: string, adminOnly: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: role, error } = await supabaseAdmin.rpc("verify_password", { p: password });
  if (error) throw new Error("권한 확인에 실패했습니다.");
  if (adminOnly) {
    if (role !== "admin") throw new Error("전체관리자만 대표 담당자를 지정할 수 있습니다.");
  } else if (role !== "admin" && role !== "staff" && role !== "user") {
    throw new Error("접근 권한이 없습니다.");
  }
  return supabaseAdmin;
}

/** 시즌 내 교회별 담당자(= 연결된 사전접수 건) 목록. */
export const listChurchManagers = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ password: z.string().min(1), seasonId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }): Promise<ChurchManagerGroup[]> => {
    const db = await requireRole(data.password, false);

    const { data: churches } = await db
      .from("churches")
      .select("id, primary_pre_registration_id")
      .eq("season_id", data.seasonId);

    const { data: regs } = await db
      .from("pre_registrations")
      .select("id, church_id, manager_name, manager_phone, status, head_count, created_at")
      .eq("season_id", data.seasonId)
      .not("church_id", "is", null)
      .order("created_at", { ascending: true });

    const byChurch = new Map<string, ChurchManager[]>();
    for (const r of regs ?? []) {
      const key = r.church_id as string;
      const list = byChurch.get(key) ?? [];
      list.push({
        preRegistrationId: r.id,
        name: r.manager_name,
        phone: r.manager_phone,
        status: r.status,
        headCount: r.head_count ?? 0,
        createdAt: r.created_at,
      });
      byChurch.set(key, list);
    }

    return (churches ?? []).map((c: any) => ({
      churchId: c.id,
      primaryPreRegistrationId: c.primary_pre_registration_id ?? null,
      managers: byChurch.get(c.id) ?? [],
    }));
  });

/** 대표 담당자 지정/해제 — 전체관리자 전용, 표시용 값만 변경한다. */
export const setPrimaryChurchManager = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        password: z.string().min(1),
        churchId: z.string().uuid(),
        preRegistrationId: z.string().uuid().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ primaryPreRegistrationId: string | null }> => {
    const db = await requireRole(data.password, true);

    const { data: church } = await db
      .from("churches")
      .select("id, season_id")
      .eq("id", data.churchId)
      .maybeSingle();
    if (!church) throw new Error("교회를 찾을 수 없습니다.");

    const { data: season } = await db
      .from("seasons")
      .select("is_active")
      .eq("id", church.season_id)
      .maybeSingle();
    if (!season?.is_active) throw new Error("활성 시즌의 교회만 지정할 수 있습니다.");

    if (data.preRegistrationId) {
      const { data: reg } = await db
        .from("pre_registrations")
        .select("id, church_id")
        .eq("id", data.preRegistrationId)
        .maybeSingle();
      if (!reg || reg.church_id !== data.churchId) {
        throw new Error("이 교회에 연결된 접수 건만 대표로 지정할 수 있습니다.");
      }
    }

    const { error } = await db
      .from("churches")
      .update({ primary_pre_registration_id: data.preRegistrationId })
      .eq("id", data.churchId);
    if (error) throw new Error("대표 담당자 저장에 실패했습니다.");

    return { primaryPreRegistrationId: data.preRegistrationId };
  });
