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

/** 8종(+과거 2종) 분류 → 운영 people 필드 매핑.
 *  people.age_group은 기존 집계가 student/adult 두 값만 사용하므로
 *  유아유치·초등은 student로 집계한다(대시보드 4칸 기준 유지). */
import { CATEGORY_PEOPLE_MAP, parseCategoryFees, sumCategoryFees } from "./member-categories";

const CATEGORY_MAP = CATEGORY_PEOPLE_MAP;

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
          primary_pre_registration_id: reg.id,
        })
        .select("id")
        .single();
      if (cErr || !created) throw new Error("교회 등록에 실패했습니다.");
      churchId = created.id;
      createdChurchId = created.id;
    }

    // 재확정 시 담당자 정보 동기화 — 사전접수에서 파생된 교회(source='pre')만 갱신한다.
    // 한 교회에 여러 제출(여러 담당자)이 묶일 수 있으므로, 대표 담당자로 지정된 건이거나
    // 이 교회에 연결된 제출이 이 건뿐일 때만 대표 표시 값을 갱신한다.
    // 수기로 만든 교회나 기존 교회에 연결한 경우의 담당자 정보는 건드리지 않는다.
    if (!createdChurchId) {
      const { data: target } = await db
        .from("churches")
        .select("id, source, primary_pre_registration_id")
        .eq("id", churchId)
        .maybeSingle();
      if (target?.source === "pre") {
        const { data: linked } = await db
          .from("pre_registrations")
          .select("id")
          .eq("church_id", churchId);
        const others = (linked ?? []).filter((r) => r.id !== reg.id);
        const isPrimary = target.primary_pre_registration_id === reg.id;
        const soleLinked = others.length === 0;
        if (isPrimary || soleLinked) {
          await db
            .from("churches")
            .update({
              contact_name: reg.manager_name,
              phone: reg.manager_phone,
              denomination: reg.denomination ?? null,
              ...(soleLinked && !target.primary_pre_registration_id
                ? { primary_pre_registration_id: reg.id }
                : {}),
            })
            .eq("id", churchId);
        }
      }
    }


    const newPersonIds: string[] = [];
    try {
      // 2) 기존 매핑 확인 — 실제로 남아 있는 파생 인원만 갱신 대상으로 삼는다.
      const priorPersonIds = list.map((m) => m.person_id).filter((v): v is string => !!v);
      const alive = new Set<string>();
      if (priorPersonIds.length) {
        const { data: existing } = await db.from("people").select("id").in("id", priorPersonIds);
        for (const p of existing ?? []) alive.add(p.id);
      }

      // 3) 운영 인원 반영 — 기존 인원은 갱신, 신규만 추가, 빠진 인원은 매핑 기준으로 제거.
      const toRow = (m: (typeof list)[number]) => {
        const map = CATEGORY_MAP[m.category as keyof typeof CATEGORY_MAP] ?? CATEGORY_MAP["male_student"];
        const notes: string[] = [];
        if (map.note) notes.push(map.note);
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
      };

      for (const m of list) {
        const row = toRow(m);
        if (m.person_id && alive.has(m.person_id)) {
          const { error: uErr } = await db.from("people").update(row).eq("id", m.person_id);
          if (uErr) throw new Error("참석자 갱신에 실패했습니다.");
          alive.delete(m.person_id);
          continue;
        }
        const { data: created, error: iErr } = await db.from("people").insert(row).select("id").single();
        if (iErr || !created) throw new Error("참석자 등록에 실패했습니다.");
        newPersonIds.push(created.id);
        const { error: mErr } = await db
          .from("pre_registration_members")
          .update({ person_id: created.id })
          .eq("id", m.id);
        if (mErr) throw new Error("참석자 매핑 저장에 실패했습니다.");
      }

      // 4) 명단에서 빠졌는데 남아 있는 파생 인원 정리 (수기 추가 인원은 매핑이 없어 보존됨)
      const stale = [...alive];
      if (stale.length) {
        const { error: sErr } = await db.from("people").delete().in("id", stale);
        if (sErr) throw new Error("빠진 인원 정리에 실패했습니다.");
      }



      // 5) 회비 — 분류별 설정 금액의 합계(유아유치는 기본 0원).
      //    세계로 성도 회비는 현장등록 전용이므로 여기서는 적용하지 않는다.
      const { data: settings } = await db
        .from("app_settings")
        .select("pre_reg_fee, category_fees")
        .eq("season_id", reg.season_id)
        .maybeSingle();
      const preRegFee = (settings as { pre_reg_fee?: number } | null)?.pre_reg_fee ?? 20000;
      const categoryFees = parseCategoryFees((settings as { category_fees?: unknown } | null)?.category_fees);
      const amount = sumCategoryFees(list.map((m) => m.category), categoryFees, preRegFee);


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
      // 부분 반영 방지 — 이번 처리로 새로 만든 것만 되돌리고, 기존 매핑은 유지한다.
      if (newPersonIds.length) {
        await db
          .from("pre_registration_members")
          .update({ person_id: null })
          .in("person_id", newPersonIds);
        await db.from("people").delete().in("id", newPersonIds);
      }
      if (createdChurchId) {
        await db.from("churches").delete().eq("id", createdChurchId);
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
