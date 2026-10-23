// 사전접수 관리 — 조회 전용 서버 함수 (방식 B).
// 익명에게 테이블을 열지 않고, 공유 비밀번호를 서버에서 재검증한 뒤
// 활성 시즌의 사전접수 데이터만 반환한다. 쓰기/삭제 기능은 없다.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { personToMember } from "./change-diff";
import { parseCategoryFees, sumCategoryFees } from "./member-categories";

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
  region: string;
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
  /** operating = 확정 건, 접수 명단(people)에서 읽은 값 */
  source: "operating" | "pre";
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
  actor: string | null;
  details: string[];
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
  .handler(async ({ data }): Promise<{ seasonId: string | null; rows: AdminPreRegistration[]; preRegFee: number; categoryFees: CategoryFeeMap }> => {
    const db = await requireStaff(data.password);

    const { data: season } = await db
      .from("seasons")
      .select("id")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!season) return { seasonId: null, rows: [], preRegFee: 0, categoryFees: {} };

    const { data: settings } = await db
      .from("app_settings")
      .select("pre_reg_fee, category_fees")
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

    // 확정 건은 운영 명단(people)이 원본 — 건 추적(pre_registration_id)으로 해당 건 인원만 읽는다.
    const preRegFee = (settings as { pre_reg_fee?: number } | null)?.pre_reg_fee ?? 0;
    const categoryFees = parseCategoryFees((settings as { category_fees?: unknown } | null)?.category_fees);
    const appliedIds = (regs ?? []).filter((r: any) => r.status === "applied" && r.church_id).map((r) => r.id);
    const opByReg = new Map<string, AdminMember[]>();
    for (let i = 0; i < appliedIds.length; i += 100) {
      const chunk = appliedIds.slice(i, i + 100);
      for (let offset = 0; ; offset += 1000) {
        const { data: ps, error: pe } = await db
          .from("people")
          .select("id, pre_registration_id, name, gender, age_group, lodging, note, created_at")
          .in("pre_registration_id", chunk)
          .order("created_at", { ascending: true })
          .range(offset, offset + 999);
        if (pe) throw new Error("운영 명단을 불러오지 못했습니다.");
        for (const p of ps ?? []) {
          const mm = personToMember(p as any);
          const list = opByReg.get(p.pre_registration_id as string) ?? [];
          list.push({ id: p.id, name: p.name, phone: mm.phone, category: mm.category, lodging_type: mm.lodging_type });
          opByReg.set(p.pre_registration_id as string, list);
        }
        if ((ps?.length ?? 0) < 1000) break;
      }
    }
    const fromOperating = (r: any) => r.status === "applied" && !!r.church_id;

    return {
      seasonId: season.id,
      preRegFee,
      categoryFees,
      rows: (regs ?? []).map((r: any) => {
        const op = fromOperating(r) ? opByReg.get(r.id) ?? [] : null;
        return {
        id: r.id,
        church_name: r.church_name,
        denomination: r.denomination ?? null,
        manager_name: r.manager_name,
        manager_phone: r.manager_phone,
        region: [[r.region_sido, r.region_sigungu].filter(Boolean).join(" "), r.road_address].filter(Boolean).join(" · "),
        head_count: op ? op.length : r.head_count,
        expected_fee: op ? sumCategoryFees(op.map((m) => m.category), categoryFees, preRegFee) : r.expected_fee,
        status: r.status,
        access_token: r.access_token,
        created_at: r.created_at,
        updated_at: r.updated_at,
        applied_at: r.applied_at ?? null,
        church_id: r.church_id ?? null,
        paid: !!r.paid,
        paid_at: r.paid_at ?? null,
        members: op ?? byReg.get(r.id) ?? [],
        source: (op ? "operating" : "pre") as "operating" | "pre",
      };
      }),
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
    return (rows ?? []).map((r: any) => ({
      ...r,
      actor: r.actor ?? null,
      details: Array.isArray(r.details) ? r.details.filter((x: unknown) => typeof x === "string") : [],
    })) as AdminChange[];
  });
