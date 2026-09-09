// 4-2 단계 — 사전접수 확정(운영 이관) · 재확정 · 납부 체크 서버 함수.
// 모든 처리는 서버에서 공유 비밀번호(admin/staff)를 재검증한 뒤 실행한다.
// 활성 시즌 건만 대상으로 하며, 과거 시즌 데이터는 조회·수정하지 않는다.
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

/** 6종 분류 → 운영 people 필드 매핑.
 *  people.age_group은 기존 집계가 student/adult 두 값만 사용하므로
 *  유아초등(child)은 student로 집계한다(대시보드 4칸 기준 유지). */
const CATEGORY_MAP: Record<string, { gender: "M" | "F"; age_group: "student" | "adult"; childNote?: boolean }> = {
  male_student: { gender: "M", age_group: "student" },
  female_student: { gender: "F", age_group: "student" },
  male_adult: { gender: "M", age_group: "adult" },
  female_adult: { gender: "F", age_group: "adult" },
  male_child: { gender: "M", age_group: "student", childNote: true },
  female_child: { gender: "F", age_group: "student", childNote: true },
};

const normChurch = (s: string | null | undefined) => {
  const base = (s ?? "").replace(/\s+/g, "").trim();
  return base.endsWith("교회") ? base.slice(0, -2) : base;
};

export type ChurchCandidate = {
  id: string;
  name: string;
  denomination: string | null;
  peopleCount: number;
  exact: boolean;
};

/** 확정 시 '기존 교회 연결' 후보 (활성 시즌 churches 유사검색). */
export const findChurchCandidates = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => authSchema.extend({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<ChurchCandidate[]> => {
    const db = await requireStaff(data.password);
    const { data: reg } = await db
      .from("pre_registrations")
      .select("id, season_id, church_name")
      .eq("id", data.id)
      .maybeSingle();
    if (!reg) throw new Error("사전접수 건을 찾을 수 없습니다.");

    const { data: churches } = await db
      .from("churches")
      .select("id, name, denomination")
      .eq("season_id", reg.season_id);

    const target = normChurch(reg.church_name);
    const matched = (churches ?? []).filter((c) => {
      const n = normChurch(c.name);
      if (!n || !target) return false;
      return n === target || (n.length >= 2 && target.length >= 2 && (n.includes(target) || target.includes(n)));
    });
    if (!matched.length) return [];

    const ids = matched.map((c) => c.id);
    const { data: people } = await db.from("people").select("church_id").in("church_id", ids);
    const counts = new Map<string, number>();
    for (const p of people ?? []) counts.set(p.church_id, (counts.get(p.church_id) ?? 0) + 1);

    return matched
      .map((c) => ({
        id: c.id,
        name: c.name,
        denomination: c.denomination ?? null,
        peopleCount: counts.get(c.id) ?? 0,
        exact: normChurch(c.name) === target,
      }))
      .sort((a, b) => Number(b.exact) - Number(a.exact) || a.name.localeCompare(b.name, "ko"));
  });

const confirmSchema = authSchema.extend({
  id: z.string().uuid(),
  mode: z.enum(["link", "new"]),
  churchId: z.string().uuid().optional(),
});

/** 확정/재확정 — 상태 applied 전환 + 운영 테이블(churches/people) 등록·갱신을 한 처리로 묶는다. */
export const confirmPreRegistration = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => confirmSchema.parse(d))
  .handler(async ({ data }): Promise<{ churchId: string; peopleCount: number; amount: number }> => {
    const db = await requireStaff(data.password);

    const { data: reg } = await db
      .from("pre_registrations")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (!reg) throw new Error("사전접수 건을 찾을 수 없습니다.");

    const { data: season } = await db
      .from("seasons")
      .select("id, is_active")
      .eq("id", reg.season_id)
      .maybeSingle();
    if (!season?.is_active) throw new Error("활성 시즌 건만 확정할 수 있습니다.");

    const { data: members } = await db
      .from("pre_registration_members")
      .select("id, name, phone, category, lodging_type, person_id")
      .eq("pre_registration_id", reg.id)
      .order("created_at", { ascending: true });
    const list = members ?? [];
    if (!list.length) throw new Error("참석자 명단이 비어 있어 확정할 수 없습니다.");

    // 1) 교회 결정 (기존 연결 / 신규 생성)
    let churchId: string;
    let createdChurchId: string | null = null;
    if (data.mode === "link") {
      if (!data.churchId) throw new Error("연결할 교회를 선택해 주세요.");
      const { data: c } = await db
        .from("churches")
        .select("id, season_id")
        .eq("id", data.churchId)
        .maybeSingle();
      if (!c || c.season_id !== reg.season_id) throw new Error("연결할 교회를 찾을 수 없습니다.");
      churchId = c.id;
    } else if (reg.church_id) {
      churchId = reg.church_id; // 재확정: 기존 파생 교회 재사용
    } else {
      const { data: created, error: cErr } = await db
        .from("churches")
        .insert({
          season_id: reg.season_id,
          name: reg.church_name,
          denomination: reg.denomination ?? null,
          contact_name: reg.manager_name,
          phone: reg.manager_phone,
          source: "pre",
        })
        .select("id")
        .single();
      if (cErr || !created) throw new Error("교회 등록에 실패했습니다.");
      churchId = created.id;
      createdChurchId = created.id;
    }

    try {
      // 2) 이 건에서 파생된 기존 people만 정리 (재확정 시 덮어쓰기)
      const priorPersonIds = list.map((m) => m.person_id).filter((v): v is string => !!v);
      if (priorPersonIds.length) {
        const { error: delErr } = await db.from("people").delete().in("id", priorPersonIds);
        if (delErr) throw new Error("기존 등록 인원 정리에 실패했습니다.");
      }

      // 3) 운영 인원 등록
      const rows = list.map((m) => {
        const map = CATEGORY_MAP[m.category] ?? CATEGORY_MAP["male_student"]!;
        const notes: string[] = [];
        if (map.childNote) notes.push("유아초등");
        if (m.lodging_type === "external") notes.push("외부숙박");
        if (m.phone) notes.push(m.phone);
        return {
          church_id: churchId,
          name: m.name,
          gender: map.gender,
          age_group: map.age_group,
          lodging: m.lodging_type === "church",
          note: notes.length ? notes.join(" · ") : null,
        };
      });
      const { data: inserted, error: pErr } = await db.from("people").insert(rows).select("id");
      if (pErr || !inserted) throw new Error("참석자 등록에 실패했습니다.");

      // 4) 매핑 추적 (pre_registration_members.person_id)
      for (let i = 0; i < list.length; i++) {
        await db
          .from("pre_registration_members")
          .update({ person_id: inserted[i]?.id ?? null })
          .eq("id", list[i]!.id);
      }

      // 5) 회비 — 세계로 성도 1만원 규칙(운영 등록 한정)
      const { data: settings } = await db
        .from("app_settings")
        .select("pre_reg_fee, segue_member_fee")
        .eq("season_id", reg.season_id)
        .maybeSingle();
      const preRegFee = (settings as { pre_reg_fee?: number } | null)?.pre_reg_fee ?? 20000;
      const segueFee = (settings as { segue_member_fee?: number } | null)?.segue_member_fee ?? 10000;
      const isSegue = `${reg.church_name ?? ""}`.includes("세계로");
      const amount = list.length * (isSegue ? segueFee : preRegFee);

      const { data: existingPay } = await db
        .from("church_payments")
        .select("id")
        .eq("church_id", churchId)
        .eq("season_id", reg.season_id)
        .maybeSingle();
      if (existingPay) {
        await db.from("church_payments").update({ amount }).eq("id", existingPay.id);
      } else {
        await db
          .from("church_payments")
          .insert({ church_id: churchId, season_id: reg.season_id, amount });
      }

      // 6) 상태 전환 + 매핑 저장
      const { error: uErr } = await db
        .from("pre_registrations")
        .update({
          status: "applied",
          applied_at: new Date().toISOString(),
          church_id: churchId,
          head_count: list.length,
        })
        .eq("id", reg.id);
      if (uErr) throw new Error("상태 갱신에 실패했습니다.");

      // 7) 변경 이력 해소 표시
      await db
        .from("pre_registration_changes")
        .update({ resolved: true })
        .eq("pre_registration_id", reg.id)
        .eq("resolved", false);

      return { churchId, peopleCount: list.length, amount };
    } catch (e) {
      // 부분 반영 방지 — 이번 처리로 만든 데이터만 되돌린다.
      const personIds = (
        await db
          .from("pre_registration_members")
          .select("person_id")
          .eq("pre_registration_id", reg.id)
      ).data;
      const ids = (personIds ?? []).map((r) => r.person_id).filter((v): v is string => !!v);
      if (createdChurchId) {
        await db.from("people").delete().eq("church_id", createdChurchId);
        await db.from("churches").delete().eq("id", createdChurchId);
        await db
          .from("pre_registration_members")
          .update({ person_id: null })
          .eq("pre_registration_id", reg.id);
      } else if (ids.length) {
        // 링크 모드 실패 시에는 새로 만든 사람만 남지 않도록 매핑 기준으로 정리
        await db.from("people").delete().in("id", ids);
        await db
          .from("pre_registration_members")
          .update({ person_id: null })
          .eq("pre_registration_id", reg.id);
      }
      throw e instanceof Error ? e : new Error("확정 처리에 실패했습니다.");
    }
  });

/** 회비 납부 완료 여부 토글 (표시 전용 값). */
export const setPreRegistrationPaid = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => authSchema.extend({ id: z.string().uuid(), paid: z.boolean() }).parse(d))
  .handler(async ({ data }): Promise<{ paid: boolean }> => {
    const db = await requireStaff(data.password);
    const { error } = await db
      .from("pre_registrations")
      .update({ paid: data.paid, paid_at: data.paid ? new Date().toISOString() : null })
      .eq("id", data.id);
    if (error) throw new Error("납부 상태 저장에 실패했습니다.");
    return { paid: data.paid };
  });
