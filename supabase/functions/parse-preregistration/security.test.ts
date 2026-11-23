import { afterEach, describe, expect, mock, test } from "bun:test";

let role: string | null = null;
let rpcError = false;
let rpcCalls = 0;
let configReads = 0;
let externalCalls = 0;
const origin = "https://www.handaryeoncamp.space";
const originalFetch = globalThis.fetch;
const fakeEnv: Record<string, string> = {
  SUPABASE_URL: "https://example.invalid",
  SUPABASE_ANON_KEY: "test-public-key",
  SUPABASE_SERVICE_ROLE_KEY: "test-server-key",
  NVIDIA_LLM_API_KEY: "test-model-key",
  NVIDIA_OCR_API_KEY: "test-ocr-key",
};
Object.assign(globalThis, { Deno: { env: { get: (key: string) => fakeEnv[key] }, serve: () => {} } });
mock.module("https://esm.sh/@supabase/supabase-js@2", () => ({
  createClient: () => ({
    rpc: async (name: string, args: Record<string, string>) => {
      expect(name).toBe("verify_password");
      expect(args['p']).toBe("test-session-password");
      rpcCalls++;
      return { data: role, error: rpcError ? new Error("unavailable") : null };
    },
    from: () => {
      configReads++;
      return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }) };
    },
  }),
}));
const parser = (await import("./index.ts")).handleRequest;
const ocr = (await import("../ocr-image/index.ts")).handleRequest;

afterEach(() => {
  globalThis.fetch = originalFetch;
  role = null;
  rpcError = false;
  rpcCalls = configReads = externalCalls = 0;
});

function request(body: unknown, password = true, source = origin) {
  return new Request("https://example.invalid/function", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: source,
      ...(password ? { "x-session-password": "test-session-password" } : {}) },
    body: JSON.stringify(body),
  });
}
function fakeExternal() {
  globalThis.fetch = mock(async () => {
    externalCalls++;
    return Response.json({ text: "테스트", choices: [{ finish_reason: "stop", message: { content: "{}" } }] });
  }) as typeof fetch;
}
for (const [name, handler, body] of [
  ["parser", parser, { text: "명단" }],
  ["ocr", ocr, { test: true }],
] as const) {
  describe(name, () => {
    test("missing password returns 401 without RPC, config or paid API", async () => {
      fakeExternal();
      expect((await handler(request(body, false))).status).toBe(401);
      expect(rpcCalls + configReads + externalCalls).toBe(0);
    });
    for (const deniedRole of [null, "user", "invalid"]) {
      test(`server role ${deniedRole} cannot call paid API`, async () => {
        role = deniedRole;
        fakeExternal();
        expect((await handler(request(body))).status).toBe(401);
        expect(rpcCalls).toBe(1);
        expect(configReads + externalCalls).toBe(0);
      });
    }
    test("RPC errors fail closed even with admin result", async () => {
      role = "admin";
      rpcError = true;
      fakeExternal();
      expect((await handler(request(body))).status).toBe(401);
      expect(configReads + externalCalls).toBe(0);
    });
    for (const allowedRole of ["staff", "admin"]) {
      test(`${allowedRole} can call paid API after RPC verification`, async () => {
        role = allowedRole;
        fakeExternal();
        const res = await handler(request(body));
        expect(res.status).toBe(200);
        expect(rpcCalls).toBe(1);
        expect(externalCalls).toBe(1);
        expect(res.headers.get("Access-Control-Allow-Origin")).toBe(origin);
      });
    }
    test("unlisted origin is denied before verification", async () => {
      role = "admin";
      fakeExternal();
      const res = await handler(request(body, true, "https://attacker.invalid"));
      expect(res.status).toBe(403);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBeNull();
      expect(rpcCalls + externalCalls).toBe(0);
    });
    for (const allowedOrigin of [origin, "https://handaryeoncamp.space", "https://handaryeon-check.lovable.app",
      "https://id-preview--608546ab-7576-4bed-bc60-0d798bc1990a.lovable.app",
      "https://project--608546ab-7576-4bed-bc60-0d798bc1990a-dev.lovable.app"]) {
      test(`preflight supports ${allowedOrigin}`, async () => {
        const res = await handler(new Request("https://example.invalid", { method: "OPTIONS", headers: { Origin: allowedOrigin } }));
        expect(res.status).toBe(204);
        expect(res.headers.get("Access-Control-Allow-Origin")).toBe(allowedOrigin);
        expect(res.headers.get("Access-Control-Allow-Headers")).toContain("x-session-password");
        expect(rpcCalls + externalCalls).toBe(0);
      });
    }
  });
}

test("parser allows exactly 20,000 characters", async () => {
  role = "staff";
  fakeExternal();
  expect((await parser(request({ text: "가".repeat(20_000) }))).status).toBe(200);
  expect(externalCalls).toBe(1);
});
test("parser rejects 20,001 characters with 413, no config or paid API", async () => {
  role = "staff";
  fakeExternal();
  expect((await parser(request({ text: "가".repeat(20_001) }))).status).toBe(413);
  expect(configReads + externalCalls).toBe(0);
});
test("parser counts whitespace before trimming", async () => {
  role = "staff";
  fakeExternal();
  expect((await parser(request({ text: " ".repeat(20_001) }))).status).toBe(413);
  expect(externalCalls).toBe(0);
});
const image = (size: number) => "data:image/png;base64," + Buffer.alloc(size).toString("base64");
test("OCR allows exactly 5 MiB of decoded image bytes", async () => {
  role = "staff";
  fakeExternal();
  expect((await ocr(request({ imageBase64: image(5 * 1024 * 1024) }))).status).toBe(200);
  expect(externalCalls).toBe(1);
});
test("OCR rejects 5 MiB plus one byte before config or paid API", async () => {
  role = "staff";
  fakeExternal();
  expect((await ocr(request({ imageBase64: image(5 * 1024 * 1024 + 1) }))).status).toBe(413);
  expect(configReads + externalCalls).toBe(0);
});
test("OCR validates all images and total size before calling any API", async () => {
  role = "staff";
  fakeExternal();
  expect((await ocr(request({ images: [image(3 * 1024 * 1024), image(3 * 1024 * 1024)] }))).status).toBe(413);
  expect(configReads + externalCalls).toBe(0);
});
test("OCR rejects invalid later image before calling API for the first", async () => {
  role = "staff";
  fakeExternal();
  expect((await ocr(request({ images: [image(3), "invalid"] }))).status).toBe(400);
  expect(configReads + externalCalls).toBe(0);
});
test("OCR test flag cannot bypass oversized input validation", async () => {
  role = "admin";
  fakeExternal();
  expect((await ocr(request({ test: true, imageBase64: image(5 * 1024 * 1024 + 1) }))).status).toBe(413);
  expect(configReads + externalCalls).toBe(0);
});
test("oversized streamed parser body without Content-Length returns 413", async () => {
  role = "staff";
  fakeExternal();
  const res = await parser(request({ text: "a".repeat(121_025) }));
  expect(res.status).toBe(413);
  expect(configReads + externalCalls).toBe(0);
});
