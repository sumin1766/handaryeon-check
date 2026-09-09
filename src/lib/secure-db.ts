// 관리 화면 전용 보안 데이터 통로 (클라이언트 측 얇은 래퍼).
// 기존 `supabase.from(...)` 사용법을 그대로 유지하면서, 실제 호출은
// 서버 함수(dbGateway)로 우회한다. 브라우저는 데이터베이스에 직접 접근하지 않는다.
import { dbGateway } from "./db-gateway.functions";
import { getSessionPassword } from "./session-password";
import { isReadOnlyMode, READ_ONLY_MESSAGE } from "./read-only";
import { toast } from "sonner";

type Result<T = any> = { data: T; error: { message: string } | null; count: number | null };

type Action = "select" | "insert" | "update" | "upsert" | "delete";

class SecureQuery implements PromiseLike<Result> {
  private req: any;

  constructor(table: string, action: Action, values?: unknown, onConflict?: string) {
    this.req = { table, action, values, filters: [], order: [] };
    if (onConflict) this.req.onConflict = onConflict;
  }

  select(cols?: string, opts?: { head?: boolean; count?: "exact" | "planned" | "estimated" }) {
    this.req.selectCols = cols ?? "";
    if (opts?.head !== undefined) this.req.head = opts.head;
    if (opts?.count) this.req.count = opts.count;
    return this;
  }
  eq(col: string, val: unknown) { this.req.filters.push({ op: "eq", col, val }); return this; }
  neq(col: string, val: unknown) { this.req.filters.push({ op: "neq", col, val }); return this; }
  gt(col: string, val: unknown) { this.req.filters.push({ op: "gt", col, val }); return this; }
  gte(col: string, val: unknown) { this.req.filters.push({ op: "gte", col, val }); return this; }
  lt(col: string, val: unknown) { this.req.filters.push({ op: "lt", col, val }); return this; }
  lte(col: string, val: unknown) { this.req.filters.push({ op: "lte", col, val }); return this; }
  like(col: string, val: unknown) { this.req.filters.push({ op: "like", col, val }); return this; }
  ilike(col: string, val: unknown) { this.req.filters.push({ op: "ilike", col, val }); return this; }
  is(col: string, val: unknown) { this.req.filters.push({ op: "is", col, val }); return this; }
  in(col: string, val: unknown[]) { this.req.filters.push({ op: "in", col, val }); return this; }
  not(col: string, op: string, val: unknown) { this.req.filters.push({ op: "not", col, val: op, val2: val }); return this; }
  order(col: string, opts?: { ascending?: boolean; nullsFirst?: boolean }) {
    this.req.order.push({ col, ascending: opts?.ascending ?? true, ...(opts?.nullsFirst === undefined ? {} : { nullsFirst: opts.nullsFirst }) });
    return this;
  }
  limit(n: number) { this.req.limit = n; return this; }
  range(a: number, b: number) { this.req.range = [a, b]; return this; }
  abortSignal(_s?: unknown) { return this; }
  single() { this.req.single = "single"; return this; }
  maybeSingle() { this.req.single = "maybeSingle"; return this; }

  private async run(): Promise<Result> {
    if (this.req.action !== "select" && isReadOnlyMode()) {
      toast.error(READ_ONLY_MESSAGE);
      throw new Error(READ_ONLY_MESSAGE);
    }
    const password = getSessionPassword();
    if (!password) {
      return { data: null, error: { message: "세션이 만료되었습니다. 다시 로그인해 주세요." }, count: null };
    }
    try {
      const res: any = await dbGateway({ data: { ...this.req, password } });
      return {
        data: res.data as any,
        error: res.error ? { message: res.error } : null,
        count: res.count ?? null,
      };
    } catch (err: any) {
      return { data: null, error: { message: err?.message ?? "요청에 실패했습니다." }, count: null };
    }
  }

  then<TR1 = Result, TR2 = never>(
    onfulfilled?: ((value: Result) => TR1 | PromiseLike<TR1>) | null,
    onrejected?: ((reason: any) => TR2 | PromiseLike<TR2>) | null,
  ): PromiseLike<TR1 | TR2> {
    return this.run().then(onfulfilled, onrejected);
  }
}

class SecureTable {
  constructor(private table: string) {}
  select(cols?: string, opts?: { head?: boolean; count?: "exact" | "planned" | "estimated" }) {
    return new SecureQuery(this.table, "select").select(cols ?? "*", opts);
  }
  insert(values: unknown) { return new SecureQuery(this.table, "insert", values); }
  update(values: unknown) { return new SecureQuery(this.table, "update", values); }
  delete() { return new SecureQuery(this.table, "delete"); }
  upsert(values: unknown, opts?: { onConflict?: string }) {
    return new SecureQuery(this.table, "upsert", values, opts?.onConflict);
  }
}

/** 관리 화면에서 `supabase` 대신 사용하는 보안 통로 클라이언트. */
export const sdb = {
  from(table: string) {
    return new SecureTable(table);
  },
};
