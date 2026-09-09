// 공개 사전접수 — 제출 전용 서버 함수 (방식 B).
// 익명에게 테이블 직접 접근을 열지 않고, 이 함수만 insert 를 수행한다.
// 조회/수정/삭제/목록 반환은 이 파일에 존재하지 않는다.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const DEFAULT_PRE_REG_FEE = 20000;

// 분류 8종 정의는 member-categories.ts 한 곳에서만 관리한다.
export {
  MEMBER_CATEGORIES,
  ALL_MEMBER_CATEGORIES,
  CATEGORY_LABELS,
  PHONE_OPTIONAL_CATEGORIES,
  isPhoneOptional,
  type MemberCategory,
  type AnyMemberCategory,
} from "./member-categories";

import {
  ALL_MEMBER_CATEGORIES,
  isPhoneOptional,
  parseCategoryFees,
  sumCategoryFees,
} from "./member-categories";

const memberSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    phone: z.string().trim().max(30).optional().default(""),
    lodging_type: z.enum(["church", "external", "none"]),
    category: z.enum(ALL_MEMBER_CATEGORIES),
  })
  .refine(
    (m) => isPhoneOptional(m.category) || m.phone.trim().length > 0,
    { message: "유아유치를 제외한 참석자는 전화번호가 필수입니다.", path: ["phone"] },
  );


const submitSchema = z.object({
  churchName: z.string().trim().min(1).max(100),
  denomination: z.string().trim().max(100).optional().default(""),
  managerName: z.string().trim().min(1).max(50),
  managerPhone: z.string().trim().min(1).max(30),
  members: z.array(memberSchema).min(1).max(300),
});

export type SubmitPreRegistrationInput = z.infer<typeof submitSchema>;

export type SubmitPreRegistrationResult = {
  accessToken: string;
  accessUrl: string;
  headCount: number;
  expectedFee: number;
  /** 같은 교회명 + 담당자 전화 조합의 기존 접수 건이 있으면 true (차단하지는 않음) */
  duplicateNotice: boolean;
};

// 가벼운 스팸 방어 (워커 인스턴스 단위 best-effort)
const hits = new Map<string, number[]>();
function rateLimit(ip: string) {
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 3_600_000);
  const perMinute = list.filter((t) => now - t < 60_000).length;
  if (perMinute >= 3 || list.length >= 10) {
    throw new Error("잠시 후 다시 시도해 주세요. (제출 횟수 제한)");
  }
  list.push(now);
  hits.set(ip, list);
}

export const submitPreRegistration = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => submitSchema.parse(data))
  .handler(async ({ data }): Promise<SubmitPreRegistrationResult> => {
    const req = getRequest();
    const ip =
      req.headers.get("cf-connecting-ip") ??
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "unknown";
    rateLimit(ip);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: season, error: seasonErr } = await supabaseAdmin
      .from("seasons")
      .select("id")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (seasonErr) throw new Error("시즌 정보를 불러오지 못했습니다.");
    if (!season) throw new Error("현재 접수 가능한 캠프가 없습니다.");

    const { data: settings } = await supabaseAdmin
      .from("app_settings")
      .select("*")
      .eq("season_id", season.id)
      .maybeSingle();
    const s = settings as { pre_reg_fee?: number; category_fees?: unknown } | null;
    const fee = s?.pre_reg_fee ?? DEFAULT_PRE_REG_FEE;
    const categoryFees = parseCategoryFees(s?.category_fees);

    const headCount = data.members.length;
    const expectedFee = sumCategoryFees(data.members.map((m) => m.category), categoryFees, fee);

    const { count } = await supabaseAdmin
      .from("pre_registrations")
      .select("id", { head: true, count: "exact" })
      .eq("season_id", season.id)
      .eq("church_name", data.churchName)
      .eq("manager_phone", data.managerPhone);

    const { data: created, error: insertErr } = await supabaseAdmin
      .from("pre_registrations")
      .insert({
        season_id: season.id,
        church_name: data.churchName,
        denomination: data.denomination?.trim() ? data.denomination.trim() : null,
        manager_name: data.managerName,
        manager_phone: data.managerPhone,
        head_count: headCount,
        expected_fee: expectedFee,
        status: "submitted",
      })
      .select("id, access_token")
      .single();
    if (insertErr || !created) throw new Error("접수 저장에 실패했습니다. 잠시 후 다시 시도해 주세요.");

    const { error: memberErr } = await supabaseAdmin.from("pre_registration_members").insert(
      data.members.map((m) => ({
        pre_registration_id: created.id,
        name: m.name,
        phone: m.phone.trim() ? m.phone.trim() : null,
        lodging_type: m.lodging_type,
        category: m.category,
      })),
    );

    if (memberErr) throw new Error("명단 저장에 실패했습니다. 담당자에게 문의해 주세요.");

    const origin = new URL(req.url).origin;
    return {
      accessToken: created.access_token,
      accessUrl: `${origin}/apply/${created.access_token}`,
      headCount,
      expectedFee,
      duplicateNotice: (count ?? 0) > 0,
    };
  });
