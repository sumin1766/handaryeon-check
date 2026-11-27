import { mock } from "bun:test";
import { describe, test, beforeEach } from "node:test";
import { strict as assert } from "node:assert";
import type { SolapiConfig } from "./solapi-notification";
import { buildAlimtalkMessage, normalizeNotificationPhone, notificationAfterConfirmation, resendWithConfirmation } from "./solapi-notification";

// Entire DB/auth/HTTP layer is in-memory. No credentials or operational rows are accessed.
const id = "11111111-1111-4111-8111-111111111111";
const seasonId = "22222222-2222-4222-8222-222222222222";
const config: SolapiConfig = { apiKey: "mock-key", apiSecret: "mock-secret", pfId: "mock-pf", templateId: "mock-template", sender: "01000000000", fallbackSms: false };
type Row = Record<string, any>;
let role: unknown;
let tables: Record<string, Row[]>;
let calls: number;
let status: number;
let providerStatus: number;
let missingConfig: boolean;

class Query {
  private filters: ((row: Row) => boolean)[] = [];
  private action = "select";
  private values: Row | Row[] = {};
  constructor(private table: string) {}
  select() { return this; }
  order() { return this; }
  eq(key: string, value: unknown) { this.filters.push((row) => row[key] === value); return this; }
  in(key: string, values: unknown[]) { this.filters.push((row) => values.includes(row[key])); return this; }
  insert(values: Row | Row[]) { this.action = "insert"; this.values = values; return this; }
  update(values: Row) { this.action = "update"; this.values = values; return this; }
  delete() { this.action = "delete"; return this; }
  private run() {
    const rows = tables[this.table] ?? [];
    let matched = rows.filter((row) => this.filters.every((filter) => filter(row)));
    if (this.action === "insert") {
      matched = (Array.isArray(this.values) ? this.values : [this.values]).map((row) => ({ id: crypto.randomUUID(), ...row }));
      tables[this.table] = [...rows, ...matched];
    } else if (this.action === "update") matched.forEach((row) => Object.assign(row, this.values));
    else if (this.action === "delete") tables[this.table] = rows.filter((row) => !matched.includes(row));
    return { data: matched, error: null };
  }
  async maybeSingle() { const result = this.run(); return { ...result, data: result.data[0] ?? null }; }
  async single() { return this.maybeSingle(); }
  then(resolve: (result: ReturnType<Query['run']>) => unknown) { return Promise.resolve(this.run()).then(resolve); }
}

const db = {
  from: (table: string) => new Query(table),
  async rpc(name: string, data: Row) {
    if (name === "verify_password") return { data: role, error: null };
    const states = tables['pre_registration_notifications'] ?? [];
    const state = states.find((row) => row['pre_registration_id'] === data['p_id']);
    if (name === "claim_pre_registration_notification") {
      const current = state ?? { pre_registration_id: data['p_id'], automatic_attempted: false, success_at: null, lock_id: null, status: "unsent" };
      if (!state) states.push(current);
      tables['pre_registration_notifications'] = states;
      if (current['lock_id'] || (data['p_automatic'] && (current['automatic_attempted'] || current['success_at']))) return { data: false, error: null };
      Object.assign(current, { lock_id: data['p_lock'], status: "sending", automatic_attempted: current['automatic_attempted'] || data['p_automatic'] });
      return { data: true, error: null };
    }
    if (name === "finish_pre_registration_notification" && state && state['lock_id'] === data['p_lock']) {
      Object.assign(state, { lock_id: null, status: data['p_status'], sent_at: data['p_status'] === "sent" ? "2026-11-26T00:00:00Z" : null,
        success_at: data['p_status'] === "sent" ? "2026-11-26T00:00:00Z" : state['success_at'], message_id: data['p_message_id'], failure_reason: data['p_reason'] });
      tables['pre_registration_notification_attempts']?.push({ ...data });
      return { data: true, error: null };
    }
    if (name === "claim_registration_operation") {
      const locks = tables['registration_operation_locks'] ??= [];
      const key = `registration:${data['p_registration']}`;
      await Promise.resolve();
      if (locks.some((l) => l['resource_key'] === key)) return { data: false, error: null };
      locks.push({ resource_key: key, owner: data['p_owner'] });
      return { data: true, error: null };
    }
    if (name === "release_registration_operation") {
      tables['registration_operation_locks'] = (tables['registration_operation_locks'] ?? []).filter((l) => l['owner'] !== data['p_owner']);
      return { data: null, error: null };
    }
    throw new Error("Unexpected mock RPC");
  },
};

const fakeFetch: typeof fetch = async (_url, options) => {
  calls++;
  assert.equal(JSON.parse(String(options?.body)).messages.length, 1);
  return new Response(JSON.stringify(providerStatus === 200
    ? { failedMessageList: [], messageList: [{ messageId: "M4Vmockmessage000000000000", statusCode: "2000" }] }
    : { errorCode: "Forbidden" }), { status: providerStatus, headers: { "Content-Type": "application/json" } });
};

mock.module("@tanstack/react-start", () => ({
  createServerOnlyFn: () => () => missingConfig ? { ...config, apiKey: "" } : config,
  createServerFn: () => {
    const builder = { inputValidator: () => builder, middleware: () => builder,
      handler: (handler: (context: { data: any }) => unknown) => (options: { data: any }) => handler(options) };
    return builder;
  },
  createMiddleware: () => ({ client: () => ({}) }),
}));
mock.module("@tanstack/react-start/server", () => ({ setResponseStatus: (code: number) => { status = code; }, getRequestHeader: () => undefined }));
mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: db }));

const { authorizeNotification, requestAlimtalk, sendRegistrationNotification } = await import("./solapi-notification.server");
const { confirmPreRegistration } = await import("./pre-registration-confirm.functions");
const reg = () => tables['pre_registrations']?.[0];
const send = (automatic = true) => sendRegistrationNotification(db as any, id, automatic, config, fakeFetch);
const confirm = () => confirmPreRegistration({ data: { password: "mock-session", id, mode: "new" } });

describe("confirmation Alimtalk — mocked only", () => {
  beforeEach(() => {
    role = "staff"; calls = 0; status = 200; providerStatus = 200; missingConfig = false;
    globalThis.fetch = fakeFetch;
    tables = {
      pre_registrations: [{ id, season_id: seasonId, status: "applied", church_name: "테스트교회", manager_name: "테스트담당자", manager_phone: "010-0000-0000", access_token: "test-only-token", applied_at: null, church_id: null }],
      seasons: [{ id: seasonId, is_active: true }],
      pre_registration_members: [{ id: "member", pre_registration_id: id, name: "테스트 참석자", phone: null, category: "male_student", lodging_type: "none", person_id: null }],
      app_settings: [{ season_id: seasonId, pre_reg_fee: 20000, category_fees: {} }],
      churches: [], people: [], church_payments: [], pre_registration_changes: [],
      pre_registration_notifications: [], pre_registration_notification_attempts: [],
    };
  });

  test("missing session returns 401 and never calls provider", async () => {
    await assert.rejects(() => authorizeNotification(undefined));
    assert.equal(status, 401); assert.equal(calls, 0);
  });
  test("invalid and user roles return 401 without provider call", async () => {
    for (const denied of [null, "user"]) { role = denied; await assert.rejects(() => authorizeNotification("mock-session")); assert.equal(status, 401); }
    assert.equal(calls, 0);
  });
  test("admin/staff roles are accepted", async () => {
    for (const allowed of ["admin", "staff"]) { role = allowed; assert.equal(await authorizeNotification("mock-session"), db); }
  });
  test("unconfirmed registration is rejected", async () => {
    const row = reg(); if (!row) throw new Error("Missing mock row"); row['status'] = "submitted";
    await assert.rejects(send, /확정완료/); assert.equal(calls, 0);
  });
  test("empty token is rejected", async () => {
    const row = reg(); if (!row) throw new Error("Missing mock row"); row['access_token'] = "";
    await assert.rejects(send, /접근 토큰/); assert.equal(calls, 0);
  });
  test("past season is read-only", async () => {
    const row = tables['seasons']?.[0]; if (!row) throw new Error("Missing mock season"); row['is_active'] = false;
    await assert.rejects(send, /활성 시즌/); assert.equal(calls, 0);
  });
  test("three variables use server registration fields", () => {
    const message = buildAlimtalkMessage(reg() as any, config);
    assert.deepEqual(message.kakaoOptions.variables, { "#{교회명}": "테스트교회", "#{담당자명}": "테스트담당자", "#{토큰}": "test-only-token" });
    assert.equal(message.to, "01000000000"); assert.equal(message.kakaoOptions.disableSms, true);
  });
  test("only 010 eleven-digit numbers are accepted", () => {
    assert.equal(normalizeNotificationPhone("010-0000-0000"), "01000000000");
    assert.equal(normalizeNotificationPhone("011-0000-0000"), null);
    assert.equal(normalizeNotificationPhone("0100000000"), null);
  });
  test("missing config records unsent without external call", async () => {
    const result = await sendRegistrationNotification(db as any, id, true, { ...config, apiKey: "" }, fakeFetch);
    assert.equal(result.status, "unsent"); assert.equal(calls, 0); assert.equal(tables['pre_registration_notification_attempts']?.length, 1);
  });
  test("concurrent first sends issue exactly one provider call", async () => {
    await Promise.all([send(), send()]); assert.equal(calls, 1);
    assert.equal(tables['pre_registration_notification_attempts']?.length, 1);
  });
  test("first confirmation sends once and preserves result/token/roster", async () => {
    const row = reg(); if (!row) throw new Error("Missing mock row"); row['status'] = "submitted";
    const result = await confirm();
    assert.equal(calls, 1); assert.equal(result.notification?.status, "sent");
    assert.equal(result.peopleCount, 1); assert.equal(result.amount, 20000);
    assert.equal(row['status'], "applied"); assert.equal(row['access_token'], "test-only-token"); assert.equal(tables['people']?.length, 1);
  });
  test("reconfirmation never automatically sends again", async () => {
    const row = reg(); if (!row) throw new Error("Missing mock row"); row['status'] = "submitted";
    await confirm(); await confirm(); assert.equal(calls, 1); assert.equal(tables['people']?.length, 1);
  });
  test("provider failure leaves confirmation applied and roster intact", async () => {
    const row = reg(); if (!row) throw new Error("Missing mock row"); row['status'] = "submitted";
    providerStatus = 500;
    const result = await confirm();
    assert.equal(result.notification?.status, "failed"); assert.equal(reg()?.['status'], "applied");
    assert.equal(tables['people']?.length, 1); assert.equal(result.amount, 20000);
    await confirm(); assert.equal(calls, 1);
  });
  test("concurrent confirmations run once; the other stops with busy message and no writes", async () => {
    const row = reg(); if (!row) throw new Error("Missing mock row"); row['status'] = "submitted";
    const results = await Promise.allSettled([confirm(), confirm()]);
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    const rejected = results.find((r) => r.status === "rejected") as PromiseRejectedResult | undefined;
    assert.match(String(rejected?.reason?.message), /처리 중/);
    assert.equal(tables['people']?.length, 1); assert.equal(tables['churches']?.length, 1); assert.equal(calls, 1);
    assert.equal(tables['registration_operation_locks']?.length, 0);
  });
  test("lock is released even when confirmation fails", async () => {
    tables['pre_registration_members'] = [];
    await assert.rejects(confirm, /명단이 비어/);
    assert.equal(tables['registration_operation_locks']?.length, 0);
  });
  test("reconfirm rewrites system note tokens but keeps staff note", async () => {
    const row = reg(); if (!row) throw new Error("Missing mock row"); row['status'] = "submitted";
    await confirm();
    const person = tables['people']?.[0]; if (!person) throw new Error("Missing person");
    person['note'] = "외부숙박 · 알레르기 있음"; person['lodging_id'] = "room-1";
    const m = tables['pre_registration_members']?.[0]; if (!m) throw new Error("Missing member");
    Object.assign(m, { name: "바뀐 이름", phone: "010-1234-5678", lodging_type: "church" });
    await confirm();
    assert.equal(tables['people']?.length, 1);
    assert.equal(person['name'], "바뀐 이름");
    assert.equal(person['note'], "010-1234-5678 · 알레르기 있음");
    assert.equal(person['lodging_id'], "room-1");
  });
  test("already-applied records without delivery history do not automatically send", async () => {
    const result = await confirm();
    assert.equal(result.notification, null); assert.equal(calls, 0);
  });
  test("notification exception cannot roll back confirmation", async () => {
    const result = await notificationAfterConfirmation(async () => { throw new Error("mock DB failure"); });
    assert.equal(result.status, "failed");
  });
  test("manual resend needs affirmative reconfirmation", async () => {
    assert.equal(await resendWithConfirmation(() => false, send), false); assert.equal(calls, 0);
    assert.equal(await resendWithConfirmation(() => true, () => send(false)), true); assert.equal(calls, 1);
  });
  test("manual resend works after prior success but automatic send stays blocked", async () => {
    await send(); await send(false); await send(); assert.equal(calls, 2);
  });
  test("fallback uses specified text; explicit 403 retries Alimtalk-only", async () => {
    const message = buildAlimtalkMessage(reg() as any, { ...config, fallbackSms: true });
    assert.equal(message.kakaoOptions.disableSms, false);
    assert.ok(message.text?.includes("https://www.handaryeoncamp.space/apply/test-only-token"));
    const flags: boolean[] = [];
    const fetcher: typeof fetch = async (_url, options) => {
      flags.push(JSON.parse(String(options?.body)).messages[0].kakaoOptions.disableSms);
      if (flags.length === 1) return new Response('{}', { status: 403 });
      return fakeFetch(_url, options);
    };
    const result = await requestAlimtalk(reg() as any, { ...config, fallbackSms: true }, fetcher);
    assert.deepEqual(flags, [false, true]); assert.equal(result.status, "sent");
  });
  test("ambiguous 5xx never retries even when fallback is on", async () => {
    providerStatus = 500;
    await requestAlimtalk(reg() as any, { ...config, fallbackSms: true }, fakeFetch);
    assert.equal(calls, 1);
  });
  test("3040 transmission timeout must not cause a fallback retry", async () => {
    let requests = 0;
    const fetcher: typeof fetch = async () => {
      requests++;
      return new Response(JSON.stringify({ failedMessageList: [{ statusCode: "3040" }], messageList: [] }), { status: 200 });
    };
    const result = await requestAlimtalk(reg() as any, { ...config, fallbackSms: true }, fetcher);
    assert.equal(requests, 1); assert.equal(result.status, "failed");
  });
});