// 삭제 동기화 — 사전접수 건 ↔ 운영(교회/인원) 데이터 양방향 삭제.
// 모든 처리는 서버에서 공유 비밀번호(admin/staff)를 재검증한 뒤 실행하며,
// 활성 시즌 건만 대상으로 한다(과거 시즌 데이터는 삭제 대상에서 제외).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const authSchema = z.object({ password: z.string().min(1) });

async function requireStaff(password: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: role, error } = await supabaseAdmin.rpc("verify_password", { p: password });
  if (error) throw new Error("권한 확인에 실패했습니다.");
  if (role !== "admin" && role !== "staff") throw new Error("접근 권한이 없습니다.");
  return supabaseAdmin;
}

type Db = Awaited<ReturnType<typeof requireStaff>>;

async function assertActiveSeason(db: Db, seasonId: string) {
  const { data: season } = await db
    .from("seasons")
    .select("id, is_active")
    .eq("id", seasonId)
    .maybeSingle();
  if (!season?.is_active) throw new Error("활성 시즌 데이터만 삭제할 수 있습니다.");
}

/** 사전접수 관리에서 삭제 — 확정 건이면 이 건에서 파생된 운영 인원도 함께 삭제. */
export const deletePreRegistration = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => authSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ deletedPeople: number; deletedChurch: boolean }> => {
    const db = await requireStaff(data.password);

    const { data: reg } = await db
      .from("pre_registrations")
      .select("id, season_id, church_id, status")
      .eq("id", data.id)
      .maybeSingle();
    if (!reg) throw new Error("사전접수 건을 찾을 수 없습니다.");
    await assertActiveSeason(db, reg.season_id);

    const { data: members } = await db
      .from("pre_registration_members")
      .select("person_id")
      .eq("pre_registration_id", reg.id);
    const personIds = (members ?? []).map((m) => m.person_id).filter((v): v is string => !!v);

    let deletedPeople = 0;
    if (personIds.length) {
      const { error: pErr } = await db.from("people").delete().in("id", personIds);
      if (pErr) throw new Error("연결된 운영 인원 삭제에 실패했습니다.");
      deletedPeople = personIds.length;
    }

    // 파생 인원이 모두 사라지고 남은 인원이 없는 사전접수 파생 교회는 함께 정리한다.
    let deletedChurch = false;
    if (reg.church_id) {
      const { data: church } = await db
        .from("churches")
        .select("id, season_id, source")
        .eq("id", reg.church_id)
        .maybeSingle();
      if (church && church.season_id === reg.season_id) {
        const { data: rest } = await db.from("people").select("id").eq("church_id", church.id).limit(1);
        if (!rest?.length && church.source === "pre") {
          const { error: cErr } = await db.from("churches").delete().eq("id", church.id);
          if (cErr) throw new Error("빈 교회 정리에 실패했습니다.");
          deletedChurch = true;
        }
      }
    }

    // 사전접수 건 삭제 (참석자·변경 이력은 함께 삭제됨)
    const { error: rErr } = await db.from("pre_registrations").delete().eq("id", reg.id);
    if (rErr) throw new Error("사전접수 건 삭제에 실패했습니다.");

    return { deletedPeople, deletedChurch };
  });

export type LinkedPreReg = {
  id: string;
  church_name: string;
  head_count: number;
  status: string;
};

/** 접수 명단에서 교회 삭제 전 — 연결된 활성 시즌 사전접수 건 조회. */
export const findLinkedPreRegistrations = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => authSchema.extend({ churchId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<LinkedPreReg[]> => {
    const db = await requireStaff(data.password);
    const { data: rows } = await db
      .from("pre_registrations")
      .select("id, church_name, head_count, status, season_id")
      .eq("church_id", data.churchId);
    const out: LinkedPreReg[] = [];
    for (const r of rows ?? []) {
      const { data: season } = await db
        .from("seasons")
        .select("is_active")
        .eq("id", r.season_id)
        .maybeSingle();
      if (season?.is_active) {
        out.push({ id: r.id, church_name: r.church_name, head_count: r.head_count, status: r.status });
      }
    }
    return out;
  });

/** 접수 명단에서 교회 삭제 — 필요 시 연결된 사전접수 건도 함께 삭제. */
export const deleteChurchWithPreRegistrations = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    authSchema.extend({ churchId: z.string().uuid(), alsoDeletePreReg: z.boolean() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ deletedPreRegs: number }> => {
    const db = await requireStaff(data.password);

    const { data: church } = await db
      .from("churches")
      .select("id, season_id")
      .eq("id", data.churchId)
      .maybeSingle();
    if (!church) throw new Error("교회를 찾을 수 없습니다.");
    await assertActiveSeason(db, church.season_id);

    let deletedPreRegs = 0;
    if (data.alsoDeletePreReg) {
      const { data: regs } = await db
        .from("pre_registrations")
        .select("id")
        .eq("church_id", church.id)
        .eq("season_id", church.season_id);
      const ids = (regs ?? []).map((r) => r.id);
      if (ids.length) {
        const { error: rErr } = await db.from("pre_registrations").delete().in("id", ids);
        if (rErr) throw new Error("연결된 사전접수 건 삭제에 실패했습니다.");
        deletedPreRegs = ids.length;
      }
    }

    const { error: cErr } = await db.from("churches").delete().eq("id", church.id);
    if (cErr) throw new Error("교회 삭제에 실패했습니다.");
    return { deletedPreRegs };
  });
