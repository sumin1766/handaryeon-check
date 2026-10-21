import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { aggregateRegions, confirmedRegionUnits, type RegionChurch, type RegionRegistration } from "@/lib/region-stats";
import { buildRegionChurchList, type ExportChurch, type ExportRegistration } from "@/lib/region-church-list";

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
      const { data: rows, error: e } = await db.from("pre_registrations").select("id, season_id, church_id, region_sido, region_sigungu, created_at, status").eq("season_id", season.id).eq("status", "applied").order("id").range(offset, offset + 499);
      if (e) throw new Error("교회 주소를 불러오지 못했습니다.");
      registrations.push(...(rows ?? []));
      if ((rows?.length ?? 0) < 500) break;
    }
    return aggregateRegions(season.id, season.name, churches, registrations);
  });

/** On-demand export read only; same role/password boundary, no contact data in the shared map query. */
export const getRegionChurchList = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: role, error: authError } = await db.rpc("verify_password", { p: data.password });
    if (authError || !["admin", "staff", "user"].includes(role ?? "")) throw new Error("접근 권한이 없습니다.");
    const { data: season, error } = await db.from("seasons").select("id, name").eq("is_active", true).order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (error || !season) throw new Error("활성 시즌을 불러오지 못했습니다.");
    const churches: ExportChurch[] = [], registrations: ExportRegistration[] = [], people: { church_id: string }[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data: rows, error: e } = await db.from("churches").select("id, season_id, primary_pre_registration_id, name, contact_name, phone").eq("season_id", season.id).order("id").range(offset, offset + 499);
      if (e) throw new Error("교회 목록을 불러오지 못했습니다.");
      churches.push(...(rows ?? []));
      if ((rows?.length ?? 0) < 500) break;
    }
    for (let offset = 0; ; offset += 500) {
      const { data: rows, error: e } = await db.from("pre_registrations").select("id, season_id, church_id, region_sido, region_sigungu, created_at, status, church_name, manager_name, manager_phone, head_count").eq("season_id", season.id).order("id").range(offset, offset + 499);
      if (e) throw new Error("담당자 목록을 불러오지 못했습니다.");
      registrations.push(...(rows ?? []));
      if ((rows?.length ?? 0) < 500) break;
    }
    // Reuse the same people-row count as intake/registry, with bounded ID batches and pagination.
    for (let start = 0; start < churches.length; start += 100) {
      const ids = churches.slice(start, start + 100).map((c) => c.id);
      for (let offset = 0; ; offset += 500) {
        const { data: rows, error: e } = await db.from("people").select("church_id").in("church_id", ids).order("id").range(offset, offset + 499);
        if (e) throw new Error("기존 인원수를 불러오지 못했습니다.");
        people.push(...(rows ?? []));
        if ((rows?.length ?? 0) < 500) break;
      }
    }
    return { ...buildRegionChurchList(season.id, season.name, churches, registrations, people), stats: aggregateRegions(season.id, season.name, churches, registrations) };
  });
/** Roster edit page: church ID → shared confirmed address (sido/sigungu only). SELECT only, same password boundary. */
export const getChurchAddresses = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1).max(200), seasonId: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ churchId: string; sido: string; sigungu: string }[]> => {
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: role, error: authError } = await db.rpc("verify_password", { p: data.password });
    if (authError || !["admin", "staff", "user"].includes(role ?? "")) throw new Error("접근 권한이 없습니다.");
    const churches: RegionChurch[] = [];
    const registrations: RegionRegistration[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data: rows, error: e } = await db.from("churches").select("id, season_id, primary_pre_registration_id").eq("season_id", data.seasonId).order("id").range(offset, offset + 499);
      if (e) throw new Error("교회를 불러오지 못했습니다.");
      churches.push(...(rows ?? []));
      if ((rows?.length ?? 0) < 500) break;
    }
    for (let offset = 0; ; offset += 500) {
      const { data: rows, error: e } = await db.from("pre_registrations").select("id, season_id, church_id, region_sido, region_sigungu, created_at, status").eq("season_id", data.seasonId).eq("status", "applied").order("id").range(offset, offset + 499);
      if (e) throw new Error("교회 주소를 불러오지 못했습니다.");
      registrations.push(...(rows ?? []));
      if ((rows?.length ?? 0) < 500) break;
    }
    return confirmedRegionUnits(data.seasonId, churches, registrations)
      .filter((u) => u.churchId && u.address)
      .map((u) => ({ churchId: u.churchId!, sido: u.address!.sido, sigungu: u.address!.sigungu }));
  });
