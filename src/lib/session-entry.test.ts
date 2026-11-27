import { describe, test } from "node:test";
import { strict as assert } from "node:assert";
import { QueryClient } from "@tanstack/react-query";
import { checkStoredSession, clearAuthSession } from "./use-auth-role";
import { writeCachedData, readCachedData } from "./query-session-cache";

describe("private session entry", () => {
  test("a stored role without a password cannot authorize entry", async () => {
    let calls = 0;
    const result = await checkStoredSession(null, async () => { calls++; return "admin"; });
    assert.deepEqual(result, { status: "locked" });
    assert.equal(calls, 0);
  });
  test("valid password uses the server role after one verification", async () => {
    let calls = 0;
    const result = await checkStoredSession("test-only", async () => { calls++; return "staff"; });
    assert.deepEqual(result, { status: "ready", role: "staff" });
    assert.equal(calls, 1);
  });
  test("invalid password locks entry", async () => {
    assert.deepEqual(await checkStoredSession("test-only", async () => null), { status: "locked" });
  });
  test("network error does not classify the session as invalid", async () => {
    assert.deepEqual(await checkStoredSession("test-only", async () => { throw new Error("offline"); }), { status: "error" });
  });
  test("lock removes role, password and both query caches but keeps public form drafts", async () => {
    const localStorage = new Map<string, string>([["hdr_auth_role", "admin"]]);
    const sessionStorage = new Map<string, string>([["hdr_session_pw", "test-only"], ["public-draft", "keep"]]);
    const storage = (map: Map<string, string>) => ({
      get length() { return map.size; },
      key: (index: number) => Array.from(map.keys())[index] ?? null,
      getItem: (key: string) => map.get(key) ?? null,
      setItem: (key: string, value: string) => { map.set(key, value); },
      removeItem: (key: string) => { map.delete(key); },
    });
    const previous = Object.getOwnPropertyDescriptor(globalThis, "window");
    Object.defineProperty(globalThis, "window", { configurable: true, value: { localStorage: storage(localStorage), sessionStorage: storage(sessionStorage), dispatchEvent: () => true } });
    try {
      const client = new QueryClient();
      client.setQueryData(["dashboard", "test-season"], { total: 12 });
      writeCachedData(["dashboard", "test-season"], { total: 12 });
      await clearAuthSession(client);
      assert.equal(localStorage.has("hdr_auth_role"), false);
      assert.equal(sessionStorage.has("hdr_session_pw"), false);
      assert.equal(readCachedData(["dashboard", "test-season"]), undefined);
      assert.equal(client.getQueryCache().getAll().length, 0);
      assert.equal(sessionStorage.get("public-draft"), "keep");
    } finally {
      if (previous) Object.defineProperty(globalThis, "window", previous);
      else Reflect.deleteProperty(globalThis, "window");
    }
  });
});