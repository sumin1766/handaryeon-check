// 접수 명단(운영 명단)에서 교회 명단을 저장한 뒤, 건별 변경 이력을 남긴다 (방식 B).
// 이력 전용 INSERT만 수행하며 운영 데이터는 바꾸지 않는다. 수정 주체는 서버에서 비밀번호로 판별한다.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { diffMembers, personToMember } from "./change-diff";
import { parseCategoryFees, sumCategoryFees } from "./member-categories";

const person = z.object({
  id: z.string().nullable(),
  name: z.string(),
  note: z.string().nullable(),
  gender: z.string(),
  age_group: z.string(),
  lodging: z.boolean(),
  pre_registration_id: z.string().uuid().nullable(),
});

export const recordRegistryEdit = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({
      password: z.string().min(1),
      churchId: z.string().uuid(),
      before: z.array(person).max(2000),
      after: z.array(person).max(2000),
    }).parse(d),
  )
  .handler(async ({ data }): Promise<{ logged: number }> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: role } = await db.rpc("verify_password", { p: data.password });
    if (role !== "admin" && role !== "staff") throw new Error("접근 권한이 없습니다.");
    const { data: regs } = await db.from("pre_registrations").select("id, season_id").eq("church_id", data.churchId).eq("status", "applied");
    if (!regs?.length) return { logged: 0 };
    const { data: settings } = await db.from("app_settings").select("pre_reg_fee, category_fees").eq("season_id", regs[0]!.season_id).maybeSingle();
    const preRegFee = (settings as any)?.pre_reg_fee ?? 0;
    const fees = parseCategoryFees((settings as any)?.category_fees);
    const conv = (p: z.infer<typeof person>) => {
      const m = personToMember(p);
      return { key: p.id, name: p.name, phone: m.phone ?? "", category: m.category, lodging: m.lodging_type, note: m.note ?? "" };
    };
    const rows = [];
    for (const r of regs) {
      const b = data.before.filter((p) => p.pre_registration_id === r.id);
      const a = data.after.filter((p) => p.pre_registration_id === r.id);
      const details = diffMembers(b.map(conv), a.map(conv));
      if (!details.length) continue;
      const fb = sumCategoryFees(b.map((p) => conv(p).category), fees, preRegFee);
      const fa = sumCategoryFees(a.map((p) => conv(p).category), fees, preRegFee);
      rows.push({
        pre_registration_id: r.id,
        change_type: a.length > b.length ? "increase" : a.length < b.length ? "decrease" : "edit",
        before_count: b.length,
        after_count: a.length,
        fee_delta: fa - fb,
        resolved: true,
        note: "접수 명단에서 수정",
        actor: role,
        details,
      });
    }
    if (rows.length) {
      const { error } = await db.from("pre_registration_changes").insert(rows);
      if (error) throw new Error("변경 이력 기록에 실패했습니다.");
    }
    return { logged: rows.length };
  });
