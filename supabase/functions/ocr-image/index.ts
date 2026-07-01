// OCR image edge function — calls NVIDIA Nemotron-OCR-v2
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { apiKey, url } = await loadConfig();
    if (!apiKey) return jsonResponse({ error: "OCR API 키가 설정되지 않았습니다." }, 500);
    const body = await req.json().catch(() => ({}));

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

    const images: string[] = Array.isArray(body?.images)
      ? body.images
      : body?.imageBase64 ? [body.imageBase64] : [];
    if (images.length === 0) return jsonResponse({ error: "이미지를 전달해주세요." }, 400);

    const parts: string[] = [];
    for (const img of images) {
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
    return jsonResponse({ error: String(e) }, 500);
  }
});
