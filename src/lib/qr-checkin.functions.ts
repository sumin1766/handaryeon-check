// QR 체크인 — 토큰으로 활성 시즌 사전접수 1건 조회 + 현장 체크인 저장 (방식 B).
// 공유 비밀번호를 서버에서 재검증(전체관리자·접수담당자)한 뒤에만 처리한다.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { CATEGORY_PEOPLE_MAP, type AnyMemberCategory } from "./member-categories";

/** 접수 명단(registry) 화면과 동일한 8칸 구분/순서 */
export const CHECKIN_CAT_KEYS = [
  "ms_l",
  "ms_n",
  "fs_l",
  "fs_n",
  "ma_l",
  "ma_n",
  "fa_l",
  "fa_n",
] as const;
export type CheckinCatKey = (typeof CHECKIN_CAT_KEYS)[number];

export const CHECKIN_CAT_LABELS: Record<CheckinCatKey, string> = {
  ms_l: "남학(숙)",
  ms_n: "남학(비)",
  fs_l: "여학(숙)",
  fs_n: "여학(비)",
  ma_l: "남어(숙)",
  ma_n: "남어(비)",
  fa_l: "여어(숙)",
  fa_n: "여어(비)",
};

/** 사전접수 분류 + 숙박유형 → 접수 명단 8칸 키 (registry 집계와 동일 규칙) */
export function checkinCatKey(category: string, lodgingType: string): CheckinCatKey | null {
  const map = CATEGORY_PEOPLE_MAP[category as AnyMemberCategory];
  if (!map) return null;
  const lodging = lodgingType === "church";
  const g = map.gender === "M" ? "m" : "f";
  const a = map.age_group === "adult" ? "a" : "s";
  return `${g}${a}_${lodging ? "l" : "n"}` as CheckinCatKey;
}

export type CheckinDetail = {
  id: string;
  churchName: string;
  denomination: string | null;
  managerName: string;
  managerPhone: string;
  headCount: number;
  status: string;
  paid: boolean;
  expectedFee: number;
  counts: Record<CheckinCatKey, number>;
  lodgings: string[];
  churchId: string | null;
  isCheckedIn: boolean;
  actualCount: number | null;
};

const baseSchema = z.object({
  password: z.string().min(1),
  token: z.string().trim().min(4).max(120),
});

async function requireStaff(password: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: role, error } = await supabaseAdmin.rpc("verify_password", { p: password });
  if (error) throw new Error("권한 확인에 실패했습니다.");
  if (role !== "admin" && role !== "staff") throw new Error("접근 권한이 없습니다.");
  return supabaseAdmin;
}

async function activeSeasonId(db: any): Promise<string | null> {
  const { data } = await db
    .from("seasons")
    .select("id")
    .eq("is_active", true)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/** QR/수동 입력 값에서 토큰만 뽑아낸다 (URL 형태도 허용). */
function normalizeToken(raw: string): string {
  const t = raw.trim();
  const m = t.match(/apply\/([A-Za-z0-9_-]+)/);
  if (m?.[1]) return m[1];
  return t.replace(/^\/+|\/+$/g, "");
}

export const getCheckinByToken = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => baseSchema.parse(d))
  .handler(async ({ data }): Promise<CheckinDetail> => {
    const db = await requireStaff(data.password);
    const seasonId = await activeSeasonId(db);
    if (!seasonId) throw new Error("활성 시즌이 없습니다.");

    const token = normalizeToken(data.token);
    const { data: reg } = await db
      .from("pre_registrations")
      .select("*")
      .eq("season_id", seasonId)
      .eq("access_token", token)
      .maybeSingle();
    if (!reg) throw new Error("해당 접수를 찾을 수 없습니다.");

    const { data: members } = await db
      .from("pre_registration_members")
      .select("category, lodging_type")
      .eq("pre_registration_id", reg.id);

    const counts = Object.fromEntries(CHECKIN_CAT_KEYS.map((k) => [k, 0])) as Record<
      CheckinCatKey,
      number
    >;
    for (const m of members ?? []) {
      const k = checkinCatKey(m.category, m.lodging_type);
      if (k) counts[k] += 1;
    }

    let lodgings: string[] = [];
    let isCheckedIn = false;
    let actualCount: number | null = null;
    if (reg.church_id) {
      const { data: church } = await db
        .from("churches")
        .select("is_checked_in, actual_count")
        .eq("id", reg.church_id)
        .maybeSingle();
      isCheckedIn = !!church?.is_checked_in;
      actualCount = church?.actual_count ?? null;

      const { data: people } = await db
        .from("people")
        .select("lodging_id")
        .eq("church_id", reg.church_id)
        .not("lodging_id", "is", null);
      const ids = Array.from(new Set((people ?? []).map((p: any) => p.lodging_id)));
      if (ids.length) {
        const { data: ls } = await db.from("lodgings").select("name").in("id", ids);
        lodgings = (ls ?? []).map((l: any) => l.name).filter(Boolean);
      }
    }

    return {
      id: reg.id,
      churchName: reg.church_name,
      denomination: reg.denomination ?? null,
      managerName: reg.manager_name,
      managerPhone: reg.manager_phone,
      headCount: reg.head_count ?? 0,
      status: reg.status,
      paid: !!reg.paid,
      expectedFee: reg.expected_fee ?? 0,
      counts,
      lodgings,
      churchId: reg.church_id ?? null,
      isCheckedIn,
      actualCount,
    };
  });

export const saveCheckin = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    baseSchema
      .extend({
        checkedIn: z.boolean(),
        actualCount: z.number().int().min(0).max(99999).nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const db = await requireStaff(data.password);
    const seasonId = await activeSeasonId(db);
    if (!seasonId) throw new Error("활성 시즌이 없습니다.");

    const token = normalizeToken(data.token);
    const { data: reg } = await db
      .from("pre_registrations")
      .select("id, church_id")
      .eq("season_id", seasonId)
      .eq("access_token", token)
      .maybeSingle();
    if (!reg) throw new Error("해당 접수를 찾을 수 없습니다.");
    if (!reg.church_id) {
      throw new Error("아직 확정(이관)되지 않은 접수입니다. 사전접수 관리에서 먼저 확정해 주세요.");
    }

    const { error } = await db
      .from("churches")
      .update({
        is_checked_in: data.checkedIn,
        checked_in_at: data.checkedIn ? new Date().toISOString() : null,
        actual_count: data.checkedIn ? data.actualCount : null,
      })
      .eq("id", reg.church_id)
      .eq("season_id", seasonId);
    if (error) throw new Error("체크인 저장에 실패했습니다.");

    return { ok: true };
  });
