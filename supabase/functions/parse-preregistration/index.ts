// LLM-based pre-registration parser via NVIDIA integrate API
// Two-stage fallback: PRIMARY_MODEL (primary key) -> BACKUP_MODEL (backup key).
// Rule-based parser (stage 1) lives on the client and is not touched here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://www.handaryeoncamp.space",
  "https://handaryeoncamp.space",
  "https://handaryeon-check.lovable.app",
  "https://id-preview--608546ab-7576-4bed-bc60-0d798bc1990a.lovable.app",
  "https://project--608546ab-7576-4bed-bc60-0d798bc1990a-dev.lovable.app",
] as const;

function responseHeaders(req: Request) {
  const origin = req.headers.get("Origin");
  return {
    ...(origin && ALLOWED_ORIGINS.some((allowed) => allowed === origin)
      ? { "Access-Control-Allow-Origin": origin } : {}),
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-session-password",
    "Vary": "Origin",
  };
}

async function verifyStaff(req: Request): Promise<boolean> {
  const password = req.headers.get("x-session-password");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_ANON_KEY");
  if (!password || !url || !key) return false;
  try {
    // Only the server-resolved RPC result grants access; never log the password.
    const client = createClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (key.startsWith("sb_") && headers.get("Authorization") === `Bearer ${key}`) headers.delete("Authorization");
        headers.set("apikey", key);
        return fetch(input, { ...init, headers });
      } },
    });
    const { data, error } = await client.rpc("verify_password", { p: password });
    return !error && (data === "staff" || data === "admin");
  } catch { return false; }
}

// Bound streamed bytes too: Content-Length may be absent or dishonest.
async function readBoundedBody(req: Request, maxBytes: number): Promise<unknown> {
  if (Number(req.headers.get("Content-Length")) > maxBytes) throw new Response(null, { status: 413 });
  const reader = req.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new Response(null, { status: 413 });
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new Response(null, { status: 400 }); }
}


// ==== Model constants (easy to swap) =========================================
const PRIMARY_MODEL = "nvidia/llama-3.3-nemotron-super-49b-v1";
const BACKUP_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";
const PRIMARY_MAX_TOKENS = 8192;
const BACKUP_MAX_TOKENS = 16384;
const PRIMARY_TIMEOUT_MS = 55_000;
const BACKUP_TIMEOUT_MS = 85_000;
// ============================================================================

const SYSTEM_PROMPT = `너는 한국 교회 여름수련회 사전접수 텍스트를 구조화하는 파서다.
입력은 사람마다 형식이 제각각이다. 맥락을 이해해서 아래 JSON 스키마로만 출력하라. 설명 금지, JSON 외 문자 금지.

규칙:
- church_name: "OO교회" 형태의 교회 이름만. "교단;" "교회이름-" 같은 라벨은 제외.
- denomination: 교회명 옆 괄호나 뒤에 오는 교단(합동/통합/고신/백석/기장/예장합동/감리교 등) 또는 지역.
- manager_name: 담당자/인솔자 이름(2~4자 한글). "전설미- 010.." "권은혜" 등 라벨·전화가 붙어도 이름만.
- manager_phone: 전화번호를 010-XXXX-XXXX 형식으로 정규화(공백/점/하이픈/괄호 제거 후 표준화).
- 참가자를 4개 카테고리로 분류: male_student(남학생), female_student(여학생), male_adult(남자어른/교역자/교사), female_adult(여자어른/교역자/교사).
- 각 사람은 숙박(overnight) 또는 비숙박(day)으로 구분. "숙박자/비숙박자" 라벨, "숙박 N명/비숙박 N명", 문장 속 "숙박"/"비숙박" 단어로 판단.
- 각 사람: { name: "이름(2~4자 한글)", note: "학년/나이/직분/괄호내용 등 부가정보" }.
  "황지우(중학교 3학년)" → {name:"황지우", note:"중3"}, "최애정 전도사" → {name:"최애정", note:"전도사"}.
- 사람이 아닌 것 제외: 인원수("3명"), 인사말/메모("감사합니다","입금했어요","이상입니다","수고하세요" 등), 라벨("숙박자","명단","이름").
- 담당자가 명단에도 등장하면 명단에도 포함(중복 허용).
- 확실하지 않으면 note에 원문 일부를 남기되, name에는 사람 이름만 넣어라.

★★ 중복 제거 절대 금지 ★★
- 같은 이름이 명단에 여러 번 나와도 절대 하나로 합치거나 제거하지 마라. 원문에 등장한 횟수만큼 각각 별도 항목으로 반드시 출력하라.
- 예: 원문에 "김유진"이 2번 나오면 출력에도 {name:"김유진"}을 정확히 2개 넣어라. "이정은"이 2번이면 2개.
- 동명이인은 실제 존재한다. 임의 병합은 인원 누락의 원인이 되므로 금지.
- 출력 전 각 카테고리(overnight/day)의 항목 수가 원문의 이름 개수와 일치하는지 반드시 확인하라.

출력 JSON 스키마(반드시 이 구조로만):
{
  "church_name": "", "denomination": "",
  "manager_name": "", "manager_phone": "",
  "male_student":  { "overnight": [{"name":"","note":""}], "day": [{"name":"","note":""}] },
  "female_student":{ "overnight": [], "day": [] },
  "male_adult":    { "overnight": [], "day": [] },
  "female_adult":  { "overnight": [], "day": [] },
  "excluded": []
}`;


function getAdmin() {
  const sbUrl = Deno.env.get("SUPABASE_URL");
  const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!sbUrl || !svc) return null;
  return createClient(sbUrl, svc, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const headers = new Headers(init?.headers);
        if (svc.startsWith("sb_") && headers.get("Authorization") === `Bearer ${svc}`) {
          headers.delete("Authorization");
        }
        headers.set("apikey", svc);
        return fetch(input, { ...init, headers });
      },
    },
  });
}

async function loadPrimaryKey(): Promise<string> {
  let key = Deno.env.get("NVIDIA_LLM_API_KEY") || Deno.env.get("NVIDIA_OCR_API_KEY") || "";
  try {
    if (!key) {
      const admin = getAdmin();
      if (admin) {
        const { data } = await admin.from("ocr_config").select("api_key").eq("id", 1).maybeSingle();
        if (data?.api_key) key = String(data.api_key).trim();
      }
    }
  } catch { /* ignore */ }
  return key;
}

async function loadBackupKey(): Promise<string> {
  let key = Deno.env.get("NVIDIA_BACKUP_API_KEY") || "";
  try {
    if (!key) {
      const admin = getAdmin();
      if (admin) {
        const { data } = await admin.from("ocr_config").select("backup_api_key").eq("id", 1).maybeSingle();
        if (data && (data as any).backup_api_key) key = String((data as any).backup_api_key).trim();
      }
    }
  } catch { /* ignore */ }
  return key;
}

function extractJson(s: string): any | null {
  if (!s) return null;
  const withoutThinking = s.replace(/<think>[\s\S]*?<\/think>/gi, "");
  const trimmed = withoutThinking.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch { /* ignore */ }
  }
  return null;
}

function buildRequestBody(model: string, text: string, maxTokens: number) {
  const body: Record<string, unknown> = {
    model,
    // 동명이인 보존을 위해 결정성을 최대한 높인다.
    temperature: 0.1,
    top_p: 0.9,
    max_tokens: maxTokens,
    stream: false,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: text },
    ],
  };

  if (model === BACKUP_MODEL) {
    body.reasoning_effort = "none";
    body.chat_template_kwargs = { enable_thinking: false };
  } else {
    body.response_format = { type: "json_object" };
  }

  return body;
}


async function callModel(model: string, key: string, text: string, maxTokens: number, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort("model_timeout"), timeoutMs);
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(buildRequestBody(model, text, maxTokens)),
  }).finally(() => clearTimeout(timeout));
  return res;
}

type StageResult =
  | { ok: true; data: any; finishReason?: string }
  | { ok: false; status: number; detail: string; reason: "http" | "json" | "truncated" | "network" };

function countPayload(data: any) {
  const count = (bucket: any, key: "overnight" | "day") => Array.isArray(bucket?.[key]) ? bucket[key].length : 0;
  const categories = {
    male_student: {
      overnight: count(data?.male_student, "overnight"),
      day: count(data?.male_student, "day"),
    },
    female_student: {
      overnight: count(data?.female_student, "overnight"),
      day: count(data?.female_student, "day"),
    },
    male_adult: {
      overnight: count(data?.male_adult, "overnight"),
      day: count(data?.male_adult, "day"),
    },
    female_adult: {
      overnight: count(data?.female_adult, "overnight"),
      day: count(data?.female_adult, "day"),
    },
  };
  const total = Object.values(categories).reduce((sum, b) => sum + b.overnight + b.day, 0);
  const excludedCount = Array.isArray(data?.excluded) ? data.excluded.length : 0;
  return { total, categories, excludedCount };
}

async function runStage(model: string, key: string, text: string, maxTokens: number, timeoutMs: number): Promise<StageResult> {
  let res: Response;
  try {
    res = await callModel(model, key, text, maxTokens, timeoutMs);
  } catch (e) {
    const detail = e instanceof DOMException && e.name === "AbortError"
      ? `timeout after ${Math.round(timeoutMs / 1000)}s`
      : String(e).slice(0, 300);
    console.log(`[parse-preregistration] ${model} network ${detail}`);
    return { ok: false, status: 0, detail, reason: "network" };
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    // Do not log key material; safe to log status + truncated body.
    console.log(`[parse-preregistration] ${model} HTTP ${res.status}`);
    return { ok: false, status: res.status, detail: detail.slice(0, 500), reason: "http" };
  }
  const data = await res.json().catch(() => null);
  const choice = data?.choices?.[0];
  const finishReason = String(choice?.finish_reason ?? "");
  const raw = choice?.message?.content ?? choice?.message?.reasoning_content ?? "";
  // Truncation is the exact bug we saw with 4096: retry on backup.
  if (finishReason === "length") {
    return { ok: false, status: 200, detail: "finish_reason=length (truncated)", reason: "truncated" };
  }
  const parsed = extractJson(typeof raw === "string" ? raw : JSON.stringify(raw));
  if (!parsed) {
    return { ok: false, status: 502, detail: `JSON 파싱 실패: ${String(raw).slice(0, 200)}`, reason: "json" };
  }
  return { ok: true, data: parsed, finishReason };
}

// Safe stage runner: never throws — converts any unexpected exception into a StageResult.
async function safeRunStage(model: string, key: string, text: string, maxTokens: number, timeoutMs: number): Promise<StageResult> {
  try {
    return await runStage(model, key, text, maxTokens, timeoutMs);
  } catch (e) {
    const detail = String(e).slice(0, 300);
    console.log(`[parse-preregistration] ${model} unexpected ${detail}`);
    return { ok: false, status: 0, detail, reason: "network" };
  }
}

export async function handleRequest(req: Request): Promise<Response> {
  const corsHeaders = responseHeaders(req);
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });


  const origin = req.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.some((allowed) => allowed === origin)) {
    return new Response(null, { status: 403, headers: corsHeaders });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: corsHeaders });
  if (!await verifyStaff(req)) return new Response(JSON.stringify({ error: "인증이 필요합니다." }), {
    status: 401, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
  try {
    const body = await readBoundedBody(req, 20_000 * 6 + 1024) as { text?: unknown } | null;
    if (typeof body?.text !== "string") return json({ error: "텍스트를 입력해주세요." }, 400);
    if (body.text.length > 20_000) return json({ error: "본문은 20,000자까지 허용됩니다." }, 413);
    const text = body.text.trim();
    if (!text) return json({ ok: false, stage: "rule_fallback", error: "텍스트를 입력해주세요." }, 200);

    // ---- Stage 2: primary model ----
    let primary: StageResult | null = null;
    let primaryAuthFail = false;
    try {
      const primaryKey = await loadPrimaryKey();
      if (!primaryKey) {
        primary = { ok: false, status: 0, detail: "primary key missing", reason: "network" };
      } else {
        console.log(`[parse-preregistration] stage=primary model=${PRIMARY_MODEL} chars=${text.length}`);
        primary = await safeRunStage(PRIMARY_MODEL, primaryKey, text, PRIMARY_MAX_TOKENS, PRIMARY_TIMEOUT_MS);
        if (primary.ok) {
          const diagnostics = countPayload(primary.data);
          console.log(`[parse-preregistration] result stage=primary total=${diagnostics.total} excluded=${diagnostics.excludedCount}`);
          return json({ ok: true, stage: "primary", model: PRIMARY_MODEL, data: primary.data, diagnostics });
        }
        if (primary.reason === "http" && (primary.status === 401 || primary.status === 403)) {
          primaryAuthFail = true;
        }
      }
    } catch (e) {
      primary = { ok: false, status: 0, detail: String(e).slice(0, 300), reason: "network" };
    }

    // ---- Stage 3: backup large model (attempt for ALL primary failures except auth) ----
    let backup: StageResult | null = null;
    let backupKeyMissing = false;
    if (!primaryAuthFail) {
      try {
        const backupKey = await loadBackupKey();
        if (!backupKey) {
          backupKeyMissing = true;
        } else {
          console.log(`[parse-preregistration] stage=backup model=${BACKUP_MODEL} primary_reason=${primary?.reason}`);
          backup = await safeRunStage(BACKUP_MODEL, backupKey, text, BACKUP_MAX_TOKENS, BACKUP_TIMEOUT_MS);
          if (backup.ok) {
            const diagnostics = countPayload(backup.data);
            console.log(`[parse-preregistration] result stage=backup total=${diagnostics.total} excluded=${diagnostics.excludedCount}`);
            return json({
              ok: true,
              stage: "backup",
              model: BACKUP_MODEL,
              data: backup.data,
              diagnostics,
              primary_reason: primary?.reason,
            });
          }
        }
      } catch (e) {
        backup = { ok: false, status: 0, detail: String(e).slice(0, 300), reason: "network" };
      }
    }

    // Both stages failed — return 200 with ok:false so the client can cleanly fall back to
    // the rule-based parser without supabase-js masking the body as "non-2xx".
    let msg: string;
    if (primaryAuthFail) {
      msg = "기본 LLM API 키가 유효하지 않습니다.";
    } else if (backupKeyMissing) {
      msg = "2단계 파싱 실패, 3단계 백업 키가 설정되지 않았습니다.";
    } else if (backup?.reason === "http" && (backup.status === 401 || backup.status === 403)) {
      msg = "백업 LLM API 키가 유효하지 않습니다.";
    } else if (backup?.status === 429) {
      msg = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
    } else if (backup?.reason === "truncated") {
      msg = "대용량 모델에서도 응답이 잘렸습니다. 명단을 나눠 처리해주세요.";
    } else {
      msg = `LLM 파싱 실패 (primary=${primary?.reason ?? "n/a"}${backup ? `, backup=${backup.reason}` : ""})`;
    }

    return json({
      ok: false,
      stage: "rule_fallback",
      error: msg,
      primary_reason: primary?.reason ?? null,
      primary_status: primary?.status ?? null,
      primary_detail: primary?.detail ?? null,
      backup_reason: backup?.reason ?? null,
      backup_status: backup?.status ?? null,
      backup_detail: backup?.detail ?? null,
      backup_key_missing: backupKeyMissing,
      primary_auth_fail: primaryAuthFail,
    }, 200);
  } catch (e) {
    if (e instanceof Response) return json({ error: e.status === 413 ? "본문은 20,000자까지 허용됩니다." : "잘못된 요청입니다." }, e.status);
    return json({ ok: false, stage: "rule_fallback", error: String(e) }, 200);
  }
}

Deno.serve(handleRequest);
