// 사전접수 관리 — 조회 전용 서버 함수 (방식 B).
// 익명에게 테이블을 열지 않고, 공유 비밀번호를 서버에서 재검증한 뒤
// 활성 시즌의 사전접수 데이터만 반환한다. 쓰기/삭제 기능은 없다.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type PreRegStatus = "submitted" | "applied" | "needs_review";

export type AdminMember = {
  id: string;
  name: string;
  phone: string | null;
  category: string;
  lodging_type: string;
};

export type AdminPreRegistration = {
  id: string;
  church_name: string;
  denomination: string | null;
  manager_name: string;
  manager_phone: string;
  head_count: number;
  expected_fee: number;
  status: string;
  access_token: string;
  created_at: string;
  updated_at: string;
  applied_at: string | null;
  church_id: string | null;
  paid: boolean;
  paid_at: string | null;
  members: AdminMember[];
};

export type AdminChange = {
  id: string;
  change_type: string;
  before_count: number;
  after_count: number;
  fee_delta: number;
  resolved: boolean;
  note: string | null;
  created_at: string;
};

const authSchema = z.object({ password: z.string().min(1) });

async function requireStaff(password: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: role, error } = await supabaseAdmin.rpc("verify_password", { p: password });
  if (error) throw new Error("권한 확인에 실패했습니다.");
  if (role !== "admin" && role !== "staff") throw new Error("접근 권한이 없습니다.");
  return supabaseAdmin;
}

export const listPreRegistrations = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => authSchema.parse(d))
  .handler(async ({ data }): Promise<{ seasonId: string | null; rows: AdminPreRegistration[]; preRegFee: number }> => {
    const db = await requireStaff(data.password);

    const { data: season } = await db
      .from("seasons")
      .select("id")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!season) return { seasonId: null, rows: [], preRegFee: 0 };

    const { data: settings } = await db
      .from("app_settings")
      .select("pre_reg_fee")
      .eq("season_id", season.id)
      .maybeSingle();

    const { data: regs, error: regErr } = await db
      .from("pre_registrations")
      .select("*")
      .eq("season_id", season.id)
      .order("created_at", { ascending: false });
    if (regErr) throw new Error("사전접수 목록을 불러오지 못했습니다.");

    const ids = (regs ?? []).map((r) => r.id);
    let members: (AdminMember & { pre_registration_id: string })[] = [];
    if (ids.length) {
      const { data: m } = await db
        .from("pre_registration_members")
        .select("id, pre_registration_id, name, phone, category, lodging_type")
        .in("pre_registration_id", ids)
        .order("created_at", { ascending: true });
      members = (m ?? []) as any;
    }

    const byReg = new Map<string, AdminMember[]>();
    for (const m of members) {
      const list = byReg.get(m.pre_registration_id) ?? [];
      list.push({
        id: m.id,
        name: m.name,
        phone: m.phone,
        category: m.category,
        lodging_type: m.lodging_type,
      });
      byReg.set(m.pre_registration_id, list);
    }

    return {
      seasonId: season.id,
      preRegFee: (settings as { pre_reg_fee?: number } | null)?.pre_reg_fee ?? 0,
      rows: (regs ?? []).map((r: any) => ({
        id: r.id,
        church_name: r.church_name,
        denomination: r.denomination ?? null,
        manager_name: r.manager_name,
        manager_phone: r.manager_phone,
        head_count: r.head_count,
        expected_fee: r.expected_fee,
        status: r.status,
        access_token: r.access_token,
        created_at: r.created_at,
        updated_at: r.updated_at,
        applied_at: r.applied_at ?? null,
        members: byReg.get(r.id) ?? [],
      })),
    };
  });

export const getPreRegistrationChanges = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => authSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<AdminChange[]> => {
    const db = await requireStaff(data.password);
    const { data: rows } = await db
      .from("pre_registration_changes")
      .select("*")
      .eq("pre_registration_id", data.id)
      .order("created_at", { ascending: true });
    return (rows ?? []) as AdminChange[];
  });
