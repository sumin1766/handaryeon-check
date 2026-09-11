// 공개 사전접수 — 본인 건 재조회·수정 전용 서버 함수 (방식 B).
// 토큰 또는 (교회명+담당자명+담당자 전화번호) 3값 일치를 서버에서 검증한 뒤에만
// 해당 1건만 반환/수정한다. 목록 조회·삭제는 제공하지 않는다.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import {
  ALL_MEMBER_CATEGORIES,
  isPhoneOptional,
  parseCategoryFees,
  sumCategoryFees,
  type AnyMemberCategory,
  type CategoryFeeMap,
} from "./member-categories";

type MemberCategory = AnyMemberCategory;

const DEFAULT_PRE_REG_FEE = 20000;

export type SelfMember = {
  name: string;
  phone: string;
  lodging_type: "church" | "external" | "none";
  category: MemberCategory;
};

export type PreRegistrationSelfDetail = {
  id: string;
  accessToken: string;
  accessUrl: string;
  churchName: string;
  denomination: string;
  managerName: string;
  managerPhone: string;
  status: "submitted" | "applied" | "needs_review";
  headCount: number;
  expectedFee: number;
  unitFee: number;
  categoryFees: CategoryFeeMap;
  members: SelfMember[];
};

const memberSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    phone: z.string().trim().max(30).optional().default(""),
    lodging_type: z.enum(["church", "external", "none"]),
    category: z.enum(ALL_MEMBER_CATEGORIES),
  })
  .refine((m) => isPhoneOptional(m.category) || m.phone.trim().length > 0, {
    message: "유아유치를 제외한 참석자는 전화번호가 필수입니다.",
    path: ["phone"],
  });

// ---- 무차별 대입 방어 (워커 인스턴스 단위 best-effort) ----
const failures = new Map<string, { count: number; until: number }>();
const LOCK_MS = 10 * 60 * 1000;

function assertNotLocked(ip: string) {
  const f = failures.get(ip);
  if (f && f.until > Date.now()) {
    const mins = Math.ceil((f.until - Date.now()) / 60000);
    throw new Error(`본인확인 시도가 너무 많습니다. ${mins}분 후 다시 시도해 주세요.`);
  }
}
function recordFailure(ip: string) {
  const now = Date.now();
  const f = failures.get(ip);
  const count = f && f.until > now - LOCK_MS ? f.count + 1 : 1;
  failures.set(ip, { count, until: count >= 5 ? now + LOCK_MS : now });
}
function clearFailures(ip: string) {
  failures.delete(ip);
}

function clientIp() {
  const req = getRequest();
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

async function loadDetail(id: string): Promise<PreRegistrationSelfDetail> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: reg, error } = await supabaseAdmin
    .from("pre_registrations")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !reg) throw new Error("접수 건을 찾을 수 없습니다.");

  const { data: settings } = await supabaseAdmin
    .from("app_settings")
    .select("*")
    .eq("season_id", reg.season_id)
    .maybeSingle();
  const unitFee =
    (settings as { pre_reg_fee?: number } | null)?.pre_reg_fee ?? DEFAULT_PRE_REG_FEE;
  const categoryFees = parseCategoryFees((settings as { category_fees?: unknown } | null)?.category_fees);

  const { data: members } = await supabaseAdmin
    .from("pre_registration_members")
    .select("*")
    .eq("pre_registration_id", id)
    .order("created_at", { ascending: true });

  const origin = new URL(getRequest().url).origin;
  return {
    id: reg.id,
    accessToken: reg.access_token,
    accessUrl: `${origin}/apply/${reg.access_token}`,
    churchName: reg.church_name,
    denomination: reg.denomination ?? "",
    managerName: reg.manager_name,
    managerPhone: reg.manager_phone,
    status: (reg.status as PreRegistrationSelfDetail["status"]) ?? "submitted",
    headCount: reg.head_count,
    expectedFee: reg.expected_fee,
    unitFee,
    categoryFees,
    members: (members ?? []).map((m) => ({
      name: m.name,
      phone: m.phone ?? "",
      lodging_type: (m.lodging_type as SelfMember["lodging_type"]) ?? "church",
      category: (m.category as MemberCategory) ?? "male_student",
    })),
  };
}

/** 접근 토큰으로 본인 건 조회 */
export const getPreRegistrationByToken = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ token: z.string().trim().min(10).max(64) }).parse(data))
  .handler(async ({ data }): Promise<PreRegistrationSelfDetail> => {
    const ip = clientIp();
    assertNotLocked(ip);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row } = await supabaseAdmin
      .from("pre_registrations")
      .select("id")
      .eq("access_token", data.token)
      .maybeSingle();
    if (!row) {
      recordFailure(ip);
      throw new Error("유효하지 않은 접근 링크입니다.");
    }
    clearFailures(ip);
    return loadDetail(row.id);
  });

/** 본인확인 3값 일치로 조회 (5회 실패 시 10분 잠금) */
export const getPreRegistrationByIdentity = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        churchName: z.string().trim().min(1).max(100),
        managerName: z.string().trim().min(1).max(50),
        managerPhone: z.string().trim().min(1).max(30),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<PreRegistrationSelfDetail> => {
    const ip = clientIp();
    assertNotLocked(ip);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("pre_registrations")
      .select("id, created_at")
      .eq("church_name", data.churchName)
      .eq("manager_name", data.managerName)
      .eq("manager_phone", data.managerPhone)
      .order("created_at", { ascending: false })
      .limit(1);
    const row = rows?.[0];
    if (!row) {
      recordFailure(ip);
      throw new Error("일치하는 접수 건이 없습니다. 입력값을 다시 확인해 주세요.");
    }
    clearFailures(ip);
    return loadDetail(row.id);
  });

export type UpdateSelfResult = {
  detail: PreRegistrationSelfDetail;
  changeType: "increase" | "decrease" | "edit" | "none";
  beforeCount: number;
  afterCount: number;
  feeDelta: number;
};

/** 본인 건 수정 저장 — 상태 전이·변경 이력 기록은 모두 이 서버 함수 안에서 결정된다. */
export const updatePreRegistrationSelf = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) =>
    z
      .object({
        token: z.string().trim().min(10).max(64),
        churchName: z.string().trim().min(1).max(100),
        denomination: z.string().trim().max(100).optional().default(""),
        managerName: z.string().trim().min(1).max(50),
        managerPhone: z.string().trim().min(1).max(30),
        members: z.array(memberSchema).min(1).max(300),
      })
      .parse(data),
  )
  .handler(async ({ data }): Promise<UpdateSelfResult> => {
    const ip = clientIp();
    assertNotLocked(ip);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: reg } = await supabaseAdmin
      .from("pre_registrations")
      .select("*")
      .eq("access_token", data.token)
      .maybeSingle();
    if (!reg) {
      recordFailure(ip);
      throw new Error("유효하지 않은 접근 링크입니다.");
    }
    clearFailures(ip);

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("*")
      .eq("season_id", reg.season_id)
      .maybeSingle();
    const unitFee = (settings as { pre_reg_fee?: number } | null)?.pre_reg_fee ?? DEFAULT_PRE_REG_FEE;
    const categoryFees = parseCategoryFees((settings as { category_fees?: unknown } | null)?.category_fees);

    const { data: beforeMembers } = await supabaseAdmin
      .from("pre_registration_members")
      .select("id, name, phone, lodging_type, category, person_id")
      .eq("pre_registration_id", reg.id);

    const beforeCount = beforeMembers?.length ?? 0;
    const afterCount = data.members.length;
    const beforeFee =
      reg.expected_fee ??
      sumCategoryFees((beforeMembers ?? []).map((m) => m.category), categoryFees, unitFee);
    const afterFee = sumCategoryFees(data.members.map((m) => m.category), categoryFees, unitFee);
    const feeDelta = afterFee - beforeFee;

    const norm = (arr: SelfMember[]) =>
      JSON.stringify(
        [...arr]
          .map((m) => [m.name.trim(), m.phone.trim(), m.lodging_type, m.category].join("|"))
          .sort(),
      );
    const beforeKey = norm(
      (beforeMembers ?? []).map((m) => ({
        name: m.name,
        phone: m.phone ?? "",
        lodging_type: m.lodging_type as SelfMember["lodging_type"],
        category: m.category as MemberCategory,
      })),
    );
    const afterKey = norm(data.members as SelfMember[]);

    const headerChanged =
      reg.church_name !== data.churchName ||
      (reg.denomination ?? "") !== (data.denomination?.trim() ?? "") ||
      reg.manager_name !== data.managerName ||
      reg.manager_phone !== data.managerPhone;

    const changeType: UpdateSelfResult["changeType"] =
      afterCount > beforeCount
        ? "increase"
        : afterCount < beforeCount
          ? "decrease"
          : beforeKey !== afterKey || headerChanged
            ? "edit"
            : "none";

    if (changeType === "none") {
      return { detail: await loadDetail(reg.id), changeType, beforeCount, afterCount, feeDelta: 0 };
    }

    // 상태 전이: applied → needs_review, 그 외는 현 상태 유지
    const nextStatus = reg.status === "applied" ? "needs_review" : reg.status;

    // 헤더/명단/이력을 한 묶음으로 처리하고, 중간 실패 시 이전 상태로 되돌린다.
    const restoreHeader = async () => {
      await supabaseAdmin
        .from("pre_registrations")
        .update({
          church_name: reg.church_name,
          denomination: reg.denomination,
          manager_name: reg.manager_name,
          manager_phone: reg.manager_phone,
          head_count: reg.head_count,
          expected_fee: reg.expected_fee,
          status: reg.status,
          updated_at: reg.updated_at,
        })
        .eq("id", reg.id);
    };
    const restoreMembers = async () => {
      await supabaseAdmin.from("pre_registration_members").delete().eq("pre_registration_id", reg.id);
      if (beforeMembers?.length) {
        await supabaseAdmin.from("pre_registration_members").insert(
          beforeMembers.map((m) => ({
            pre_registration_id: reg.id,
            name: m.name,
            phone: m.phone,
            lodging_type: m.lodging_type,
            category: m.category,
            person_id: m.person_id,
          })),
        );
      }
    };

    // 확정 건의 "참석자 ↔ 운영 인원(person_id)" 매핑 유지.
    // 수정 저장은 참석자 행을 다시 쓰지만, 이름(+분류)이 같은 참석자는 기존 매핑을 그대로 이어받는다.
    const unusedBefore = [...(beforeMembers ?? [])];
    const takeMapping = (name: string, category: string): string | null => {
      const pick = (fn: (m: (typeof unusedBefore)[number]) => boolean) => {
        const i = unusedBefore.findIndex((m) => !!m.person_id && fn(m));
        if (i < 0) return null;
        const [m] = unusedBefore.splice(i, 1);
        return m?.person_id ?? null;
      };
      return (
        pick((m) => m.name.trim() === name.trim() && m.category === category) ??
        pick((m) => m.name.trim() === name.trim())
      );
    };
    const insertRows = data.members.map((m) => ({
      pre_registration_id: reg.id,
      name: m.name,
      phone: m.phone.trim() ? m.phone.trim() : null,
      lodging_type: m.lodging_type,
      category: m.category,
      person_id: takeMapping(m.name, m.category),
    }));
    // 이번 수정에서 빠진 참석자의 파생 운영 인원 → 저장 성공 후 정리한다.
    const droppedPersonIds = unusedBefore
      .map((m) => m.person_id)
      .filter((v): v is string => !!v);

    const { error: updErr } = await supabaseAdmin
      .from("pre_registrations")
      .update({
        church_name: data.churchName,
        denomination: data.denomination?.trim() ? data.denomination.trim() : null,
        manager_name: data.managerName,
        manager_phone: data.managerPhone,
        head_count: afterCount,
        expected_fee: afterFee,
        status: nextStatus,
        updated_at: new Date().toISOString(),
      })
      .eq("id", reg.id);
    if (updErr) throw new Error(`저장에 실패했습니다: ${updErr.message}`);

    const { error: delErr } = await supabaseAdmin
      .from("pre_registration_members")
      .delete()
      .eq("pre_registration_id", reg.id);
    if (delErr) {
      await restoreHeader();
      throw new Error(`명단 저장에 실패했습니다: ${delErr.message}`);
    }

    const { error: insErr } = await supabaseAdmin.from("pre_registration_members").insert(
      data.members.map((m) => ({
        pre_registration_id: reg.id,
        name: m.name,
        phone: m.phone.trim() ? m.phone.trim() : null,
        lodging_type: m.lodging_type,
        category: m.category,
      })),
    );
    if (insErr) {
      await restoreMembers();
      await restoreHeader();
      throw new Error(`명단 저장에 실패했습니다: ${insErr.message}`);
    }

    const { error: logErr } = await supabaseAdmin.from("pre_registration_changes").insert({
      pre_registration_id: reg.id,
      change_type: changeType,
      before_count: beforeCount,
      after_count: afterCount,
      fee_delta: feeDelta,
      resolved: false,
      note: reg.status === "applied" ? "확정 후 교회 수정 — 재검토 필요" : null,
    });
    if (logErr) {
      await restoreMembers();
      await restoreHeader();
      throw new Error(`변경 이력 기록에 실패했습니다: ${logErr.message}`);
    }

    return { detail: await loadDetail(reg.id), changeType, beforeCount, afterCount, feeDelta };
  });
