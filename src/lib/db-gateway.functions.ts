// 공용 보안 통로 (방식 B).
// 관리 화면이 데이터베이스를 직접 호출하지 않고, 이 서버 함수를 통해서만 읽고 쓴다.
// 모든 호출은 서버에서 공유 비밀번호 역할을 재확인한 뒤 허용된 테이블/동작만 실행한다.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** 통로를 통해 접근 가능한 테이블 목록 (그 외는 거부) */
const ALLOWED_TABLES = [
  "people",
  "churches",
  "church_payments",
  "bath_coupons",
  "seasons",
  "app_settings",
  "lodgings",
  "places",
  "receipt_layout",
  "segue_merge_log",
  "duplicate_dismissals",
] as const;

const filterSchema = z.object({
  op: z.enum(["eq", "neq", "in", "is", "not", "gt", "gte", "lt", "lte", "like", "ilike", "contains"]),
  col: z.string().min(1).max(64),
  val: z.any(),
  val2: z.any().optional(),
});

const requestSchema = z.object({
  password: z.string().min(1),
  table: z.enum(ALLOWED_TABLES),
  action: z.enum(["select", "insert", "update", "upsert", "delete"]),
  values: z.any().optional(),
  selectCols: z.string().max(2000).optional(),
  filters: z.array(filterSchema).max(30).default([]),
  order: z
    .array(z.object({ col: z.string().max(64), ascending: z.boolean().default(true), nullsFirst: z.boolean().optional() }))
    .max(5)
    .default([]),
  limit: z.number().int().min(1).max(100000).optional(),
  range: z.tuple([z.number().int().min(0), z.number().int().min(0)]).optional(),
  single: z.enum(["single", "maybeSingle"]).optional(),
  head: z.boolean().optional(),
  count: z.enum(["exact", "planned", "estimated"]).optional(),
  onConflict: z.string().max(200).optional(),
});

export type DbGatewayRequest = z.infer<typeof requestSchema>;

async function requireRole(password: string, writing: boolean) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: role, error } = await supabaseAdmin.rpc("verify_password", { p: password });
  if (error) throw new Error("권한 확인에 실패했습니다.");
  if (role !== "admin" && role !== "staff" && role !== "user") {
    throw new Error("접근 권한이 없습니다.");
  }
  if (writing && role !== "admin" && role !== "staff") {
    throw new Error("변경 권한이 없습니다.");
  }
  return supabaseAdmin;
}

export const dbGateway = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => requestSchema.parse(d))
  .handler(async ({ data }): Promise<any> => {
    const writing = data.action !== "select";
    const db = await requireRole(data.password, writing);

    const table = db.from(data.table as never) as any;
    let q: any;

    if (data.action === "select") {
      q = table.select(data.selectCols ?? "*", {
        head: data.head ?? false,
        ...(data.count ? { count: data.count } : {}),
      });
    } else if (data.action === "insert") {
      q = table.insert(data.values);
      if (data.selectCols !== undefined) q = q.select(data.selectCols || "*");
    } else if (data.action === "upsert") {
      q = table.upsert(data.values, data.onConflict ? { onConflict: data.onConflict } : undefined);
      if (data.selectCols !== undefined) q = q.select(data.selectCols || "*");
    } else if (data.action === "update") {
      q = table.update(data.values);
      if (data.selectCols !== undefined) q = q.select(data.selectCols || "*");
    } else {
      q = table.delete();
      if (data.selectCols !== undefined) q = q.select(data.selectCols || "*");
    }

    for (const f of data.filters) {
      if (f.op === "in") q = q.in(f.col, f.val as unknown[]);
      else if (f.op === "not") q = q.not(f.col, String(f.val), f.val2 ?? null);
      else if (f.op === "is") q = q.is(f.col, f.val as null);
      else q = (q as any)[f.op](f.col, f.val);
    }

    for (const o of data.order) {
      q = q.order(o.col, { ascending: o.ascending, ...(o.nullsFirst === undefined ? {} : { nullsFirst: o.nullsFirst }) });
    }
    if (data.range) q = q.range(data.range[0], data.range[1]);
    else if (data.limit !== undefined) q = q.limit(data.limit);

    if (data.single === "single") q = q.single();
    else if (data.single === "maybeSingle") q = q.maybeSingle();

    const res = await q;
    return {
      data: res.data ?? null,
      error: res.error ? (res.error.message as string) : null,
      count: res.count ?? null,
    };
  });
