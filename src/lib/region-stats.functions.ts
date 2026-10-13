import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aggregateRegions, type RegionChurch, type RegionRegistration } from "@/lib/region-stats";

/** Same shared-password authorization as church managers (way B); SELECT only. */
export const getRegionStats = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: role, error: authError } = await db.rpc("verify_password", { p: data.password });
    if (authError || !["admin", "staff", "user"].includes(role ?? "")) throw new Error("접근 권한이 없습니다.");
    const { data: season, error } = await db.from("seasons").select("id, name").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error) throw new Error("활성 시즌을 불러오지 못했습니다.");
    if (!season) return null;
    const churches: RegionChurch[] = [];
    const registrations: RegionRegistration[] = [];
    // Page both reads: never silently lose rows at the database's result limit.
    for (let offset = 0; ; offset += 500) {
      const { data: rows, error: e } = await db.from("churches").select("id, season_id, primary_pre_registration_id").eq("season_id", season.id).order("id").range(offset, offset + 499);
      if (e) throw new Error("지역별 교회를 불러오지 못했습니다.");
      churches.push(...(rows ?? []));
      if ((rows?.length ?? 0) < 500) break;
    }
    for (let offset = 0; ; offset += 500) {
      const { data: rows, error: e } = await db.from("pre_registrations").select("id, season_id, church_id, region_sido, region_sigungu, created_at").eq("season_id", season.id).order("id").range(offset, offset + 499);
      if (e) throw new Error("교회 주소를 불러오지 못했습니다.");
      registrations.push(...(rows ?? []));
      if ((rows?.length ?? 0) < 500) break;
    }
    return aggregateRegions(season.id, season.name, churches, registrations);
  });