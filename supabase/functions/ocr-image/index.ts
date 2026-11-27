// OCR image edge function — calls NVIDIA Nemotron-OCR-v2
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

async function verifyStaff(req: Request): Promise<401 | 500 | null> {
  const password = req.headers.get("x-session-password");
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return 500;
  if (!password) return 401;
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
    if (error) return 500;
    return data === "staff" || data === "admin" ? null : 401;
  } catch { return 500; }
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


function normalizeUrl(raw: string): string {
  const u = (raw || "").replace(/\/+$/, "");
  if (/nemotron-ocr-v2[_-]?english/i.test(u)) {
    return "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2";
  }
  return u || "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2";
}

async function loadConfig(): Promise<{ apiKey: string; url: string }> {
  let apiKey = Deno.env.get("NVIDIA_OCR_API_KEY") || "";
  let url = Deno.env.get("NVIDIA_OCR_BASE_URL") || "";
  try {
    const sbUrl = Deno.env.get("SUPABASE_URL");
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (sbUrl && svc) {
      const admin = createClient(sbUrl, svc, { auth: { persistSession: false } });
      const { data } = await admin.from("ocr_config").select("api_key, base_url").eq("id", 1).maybeSingle();
      if (data?.api_key && String(data.api_key).trim()) apiKey = String(data.api_key).trim();
      if (data?.base_url && String(data.base_url).trim()) url = String(data.base_url).trim();
    }
  } catch { /* fall back to env */ }
  return { apiKey, url: normalizeUrl(url) };
}

// Recursively collect plausible text fields and bbox-like info
type Item = { text: string; y: number; x: number };
function collect(node: unknown, acc: Item[]) {
  if (!node) return;
  if (Array.isArray(node)) {
    for (const n of node) collect(n, acc);
    return;
  }
  if (typeof node !== "object") return;
  const obj = node as Record<string, unknown>;
  const textKey = ["text", "transcription", "label", "value", "content"].find(
    (k) => typeof obj[k] === "string" && (obj[k] as string).trim().length > 0,
  );
  if (textKey) {
    let y = 0, x = 0;
    const bbox = (obj["bbox"] ?? obj["bounding_box"] ?? obj["box"] ?? obj["polygon"] ?? obj["points"]) as unknown;
    if (Array.isArray(bbox) && bbox.length > 0) {
      const flat: number[] = [];
      const walk = (v: unknown) => {
        if (typeof v === "number") flat.push(v);
        else if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") Object.values(v as Record<string, unknown>).forEach(walk);
      };
      walk(bbox);
      if (flat.length >= 2) {
        const xs: number[] = [], ys: number[] = [];
        for (let i = 0; i + 1 < flat.length; i += 2) { xs.push(flat[i]); ys.push(flat[i + 1]); }
        if (xs.length && ys.length) {
          x = Math.min(...xs); y = Math.min(...ys);
        }
      }
    }
    acc.push({ text: (obj[textKey] as string).trim(), y, x });
  }
  for (const v of Object.values(obj)) collect(v, acc);
}

function joinItems(items: Item[]): string {
  if (items.length === 0) return "";
  const hasCoords = items.some((i) => i.y || i.x);
  if (!hasCoords) return items.map((i) => i.text).join("\n");
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  // Group into lines using a y-tolerance based on median spacing
  const lines: Item[][] = [];
  const tol = 12;
  for (const it of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line[0].y - it.y) <= tol) line.push(it);
    else lines.push([it]);
  }
  return lines.map((ln) => ln.sort((a, b) => a.x - b.x).map((i) => i.text).join(" ")).join("\n");
}

async function ocrOne(dataUrl: string, apiKey: string, url: string): Promise<string> {
  if (!/^data:image\/(png|jpe?g);base64,/i.test(dataUrl)) {
    throw new Response("PNG/JPEG data URL만 지원됩니다.", { status: 422 });
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      input: [{ type: "image_url", url: dataUrl }],
      aggregation_level: "paragraph",
      merge_level: "paragraph",
      output_format: "text",
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    let msg = `OCR 서비스 오류 (${res.status})`;
    if (res.status === 422) msg = "이미지 형식이 올바르지 않습니다. PNG/JPEG로 다시 시도해주세요.";
    else if (res.status === 429) msg = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
    else if (res.status === 401 || res.status === 403) msg = "OCR API 키가 유효하지 않습니다.";
    else if (res.status >= 500) msg = "OCR 서비스가 일시적으로 응답하지 않습니다.";
    throw new Response(JSON.stringify({ error: msg, detail: body.slice(0, 500) }), { status: res.status });
  }
  const data = await res.json();
  const items: Item[] = [];
  collect(data, items);
  return joinItems(items);
}

export async function handleRequest(req: Request): Promise<Response> {
  const corsHeaders = responseHeaders(req);
function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
}


  const origin = req.headers.get("Origin");
  if (origin && !ALLOWED_ORIGINS.some((allowed) => allowed === origin)) {
    return new Response(null, { status: 403, headers: corsHeaders });
  }
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: corsHeaders });
  const authFailure = await verifyStaff(req);
  if (authFailure !== null) return new Response(JSON.stringify({
    error: authFailure === 401 ? "인증이 필요합니다." : "인증 서버 설정 또는 통신 오류입니다.",
  }), {
    status: authFailure, headers: { "Content-Type": "application/json", ...corsHeaders },
  });
  try {
    const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
    const body = await readBoundedBody(req, Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4096) as {
      test?: unknown; images?: unknown; imageBase64?: unknown;
    } | null;
    const images: unknown[] = Array.isArray(body?.images)
      ? body.images : body?.imageBase64 ? [body.imageBase64] : [];
    let totalBytes = 0;
    for (const image of images) {
      if (typeof image !== "string") return jsonResponse({ error: "PNG/JPEG 이미지만 지원됩니다." }, 400);
      const match = image.match(/^data:image\/(png|jpe?g);base64,([A-Za-z0-9+/]*={0,2})$/i);
      const encoded = match?.[2];
      if (!encoded || encoded.length % 4 !== 0) return jsonResponse({ error: "이미지 형식이 올바르지 않습니다." }, 400);
      const padding = encoded.endsWith("==") ? 2 : encoded.endsWith("=") ? 1 : 0;
      totalBytes += encoded.length / 4 * 3 - padding;
      if (totalBytes > MAX_IMAGE_BYTES) return jsonResponse({ error: "이미지는 요청당 5MB까지 허용됩니다." }, 413);
    }
    if (body?.test !== true && images.length === 0) return jsonResponse({ error: "이미지를 전달해주세요." }, 400);
    const { apiKey, url } = await loadConfig();
    if (!apiKey) return jsonResponse({ error: "OCR API 키가 설정되지 않았습니다." }, 500);

    if (body?.test === true) {
      const px = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
      try {
        await ocrOne(px, apiKey, url);
        return jsonResponse({ ok: true });
      } catch (e) {
        if (e instanceof Response) {
          const t = await e.text();
          return jsonResponse({ ok: false, status: e.status, detail: t }, 200);
        }
        return jsonResponse({ ok: false, detail: String(e) }, 200);
      }
    }

    const parts: string[] = [];
    for (const img of images) {
      if (typeof img !== "string") return jsonResponse({ error: "이미지 형식이 올바르지 않습니다." }, 400);
      try {
        const t = await ocrOne(img, apiKey, url);
        if (t) parts.push(t);
      } catch (e) {
        if (e instanceof Response) {
          const t = await e.text();
          try { return new Response(t, { status: e.status, headers: { "Content-Type": "application/json", ...corsHeaders } }); }
          catch { return jsonResponse({ error: t }, e.status); }
        }
        return jsonResponse({ error: String(e) }, 500);
      }
    }
    return jsonResponse({ text: parts.join("\n\n") });
  } catch (e) {
    if (e instanceof Response) return jsonResponse({ error: e.status === 413 ? "이미지는 요청당 5MB까지 허용됩니다." : "잘못된 요청입니다." }, e.status);
    return jsonResponse({ error: String(e) }, 500);
  }
}

Deno.serve(handleRequest);
