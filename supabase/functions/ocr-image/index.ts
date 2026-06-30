// OCR image edge function — calls NVIDIA Nemotron-OCR-v2
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

function inferUrl(): string {
  // Multilingual Nemotron-OCR-v2 (한국어 지원). v2_english는 영어 전용이므로 사용 금지.
  const raw = (Deno.env.get("NVIDIA_OCR_BASE_URL") ||
    "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2").replace(/\/+$/, "");
  // 영어 전용 엔드포인트가 설정된 경우 multilingual로 강제 교체
  if (/nemotron-ocr-v2[_-]?english/i.test(raw)) {
    return "https://ai.api.nvidia.com/v1/cv/nvidia/nemotron-ocr-v2";
  }
  return raw;
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

async function ocrOne(dataUrl: string, apiKey: string): Promise<string> {
  if (!/^data:image\/(png|jpe?g);base64,/i.test(dataUrl)) {
    throw new Response("PNG/JPEG data URL만 지원됩니다.", { status: 422 });
  }
  const res = await fetch(inferUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      input: [{ type: "image_url", url: dataUrl }],
      // 줄/문단 단위 병합 — 모델이 지원하면 읽기 순서 품질이 올라가고, 무시되면 그대로 진행됨
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
    const apiKey = Deno.env.get("NVIDIA_OCR_API_KEY");
    if (!apiKey) return jsonResponse({ error: "NVIDIA_OCR_API_KEY가 설정되지 않았습니다." }, 500);
    const body = await req.json().catch(() => ({}));

    // Connection test mode
    if (body?.test === true) {
      // 1x1 white PNG
      const px = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==";
      try {
        await ocrOne(px, apiKey);
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
        const t = await ocrOne(img, apiKey);
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
