// 삭제 명단 휴지통 — 전체관리자 전용, 활성 시즌만 (방식 B: 서버에서 공유 비밀번호 재검증).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { buildRestorePayload, type TrashKind, type TrashSnapshot } from "./registration-trash";

async function requireAdminActive(password: string, seasonId: string) {
  const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
  const { data: role } = await db.rpc("verify_password", { p: password });
  if (role !== "admin") throw new Error("전체관리자만 사용할 수 있습니다.");
  const { data: season } = await db.from("seasons").select("id, name, is_active").eq("id", seasonId).maybeSingle();
  if (!season) throw new Error("시즌을 찾을 수 없습니다.");
  if (!season.is_active) throw new Error("현재(활성) 시즌만 대상입니다.");
  return { db, season };
}

const base = z.object({ password: z.string().min(1), seasonId: z.string().uuid() });

export const countTrashTargets = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => base.parse(d))
  .handler(async ({ data }): Promise<{ pending: number; pendingPeople: number; confirmed: number; confirmedPeople: number }> => {
    const { db, season } = await requireAdminActive(data.password, data.seasonId);
    const { data: pend } = await db.from("pre_registrations").select("head_count").eq("season_id", season.id).is("church_id", null);
    const { data: ch } = await db.from("churches").select("id").eq("season_id", season.id);
    const ids = (ch ?? []).map((c) => c.id);
    let confirmedPeople = 0;
    if (ids.length) {
      const { count } = await db.from("people").select("id", { count: "exact", head: true }).in("church_id", ids);
      confirmedPeople = count ?? 0;
    }
    return {
      pending: pend?.length ?? 0,
      pendingPeople: (pend ?? []).reduce((s, r) => s + (r.head_count ?? 0), 0),
      confirmed: ids.length,
      confirmedPeople,
    };
  });

export const moveToTrash = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    base.extend({ kind: z.enum(["pending", "confirmed"]), confirmName: z.string(), confirmPassword: z.string() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ moved: number }> => {
    const { db, season } = await requireAdminActive(data.password, data.seasonId);
    if (data.confirmName !== season.name) throw new Error("시즌 이름이 일치하지 않습니다.");
    const { data: r2 } = await db.rpc("verify_password", { p: data.confirmPassword });
    if (r2 !== "admin") throw new Error("관리자 비밀번호가 올바르지 않습니다.");
    const { data: moved, error } = await db.rpc("trash_season_registrations", { p_season: season.id, p_kind: data.kind });
    if (error) throw new Error("휴지통 이동에 실패했습니다.");
    return { moved: (moved as number) ?? 0 };
  });

export type TrashItem = {
  id: string;
  original_status: TrashKind;
  church_name: string;
  manager_name: string | null;
  head_count: number;
  deleted_at: string;
  members: { name: string; category: string; lodging_type: string }[];
};

export const listTrash = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => base.parse(d))
  .handler(async ({ data }): Promise<TrashItem[]> => {
    const { db, season } = await requireAdminActive(data.password, data.seasonId);
    const { data: rows, error } = await db
      .from("registration_trash")
      .select("*")
      .eq("season_id", season.id)
      .order("deleted_at", { ascending: false });
    if (error) throw new Error("휴지통을 불러오지 못했습니다.");
    return (rows ?? []).map((r) => {
      const p = buildRestorePayload(r.snapshot as TrashSnapshot, season.id);
      return {
        id: r.id,
        original_status: r.original_status as TrashKind,
        church_name: r.church_name,
        manager_name: r.manager_name,
        head_count: r.head_count,
        deleted_at: r.deleted_at,
        members: p.members.map(({ name, category, lodging_type }) => ({ name, category, lodging_type })),
      };
    });
  });

export const restoreFromTrash = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => base.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ preRegistrationId: string }> => {
    const { db, season } = await requireAdminActive(data.password, data.seasonId);
    const { data: item } = await db
      .from("registration_trash")
      .select("*")
      .eq("id", data.id)
      .eq("season_id", season.id)
      .maybeSingle();
    if (!item) throw new Error("휴지통 항목을 찾을 수 없습니다.");

    const payload = buildRestorePayload(item.snapshot as TrashSnapshot, season.id);
    // access_token은 DB 기본값으로 새로 발급된다.
    const { data: reg, error } = await db.from("pre_registrations").insert(payload.registration).select("id").single();
    if (error || !reg) throw new Error("복구(새 접수 생성)에 실패했습니다.");
    if (payload.members.length) {
      const { error: mErr } = await db
        .from("pre_registration_members")
        .insert(payload.members.map((m) => ({ ...m, pre_registration_id: reg.id })));
      if (mErr) {
        await db.from("pre_registrations").delete().eq("id", reg.id);
        throw new Error("참석자 명단 복구에 실패했습니다.");
      }
    }
    await db.from("registration_trash").delete().eq("id", item.id).eq("season_id", season.id);
    return { preRegistrationId: reg.id };
  });
