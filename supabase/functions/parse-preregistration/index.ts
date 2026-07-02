// LLM-based pre-registration parser via NVIDIA integrate API
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

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

const MODELS = [
  "nvidia/llama-3.3-nemotron-super-49b-v1",
  "meta/llama-3.3-70b-instruct",
  "nvidia/llama-3.1-nemotron-70b-instruct",
];

async function loadKey(): Promise<string> {
  let key = Deno.env.get("NVIDIA_LLM_API_KEY") || Deno.env.get("NVIDIA_OCR_API_KEY") || "";
  try {
    const sbUrl = Deno.env.get("SUPABASE_URL");
    const svc = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!key && sbUrl && svc) {
      const admin = createClient(sbUrl, svc, { auth: { persistSession: false } });
      const { data } = await admin.from("ocr_config").select("api_key").eq("id", 1).maybeSingle();
      if (data?.api_key) key = String(data.api_key).trim();
    }
  } catch { /* ignore */ }
  return key;
}

function extractJson(s: string): any | null {
  if (!s) return null;
  const trimmed = s.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  try { return JSON.parse(trimmed); } catch { /* fall through */ }
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first >= 0 && last > first) {
    try { return JSON.parse(trimmed.slice(first, last + 1)); } catch { /* ignore */ }
  }
  return null;
}

async function callModel(model: string, key: string, text: string) {
  const res = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      top_p: 0.9,
      max_tokens: 4096,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: text },
      ],
    }),
  });
  return res;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const key = await loadKey();
    if (!key) return json({ error: "LLM API 키가 설정되지 않았습니다." }, 500);

    const body = await req.json().catch(() => ({}));
    const text: string = String(body?.text ?? "").trim();
    if (!text) return json({ error: "텍스트를 입력해주세요." }, 400);

    let lastErr: { status: number; detail: string } | null = null;
    for (const model of MODELS) {
      let res: Response;
      try {
        res = await callModel(model, key, text);
      } catch (e) {
        lastErr = { status: 500, detail: String(e) };
        continue;
      }
      if (!res.ok) {
        const detail = await res.text().catch(() => "");
        lastErr = { status: res.status, detail: detail.slice(0, 500) };
        // 429/5xx: try next model
        if (res.status === 429 || res.status >= 500 || res.status === 404 || res.status === 400) continue;
        // 401/403: fatal
        break;
      }
      const data = await res.json().catch(() => null);
      const raw = data?.choices?.[0]?.message?.content ?? "";
      const parsed = extractJson(typeof raw === "string" ? raw : JSON.stringify(raw));
      if (!parsed) {
        lastErr = { status: 502, detail: `JSON 파싱 실패: ${String(raw).slice(0, 300)}` };
        continue;
      }
      return json({ ok: true, model, data: parsed });
    }

    const s = lastErr?.status ?? 500;
    let msg = `LLM 서비스 오류 (${s})`;
    if (s === 401 || s === 403) msg = "LLM API 키가 유효하지 않습니다.";
    else if (s === 429) msg = "요청이 너무 많습니다. 잠시 후 다시 시도해주세요.";
    else if (s >= 500) msg = "LLM 서비스가 일시적으로 응답하지 않습니다.";
    return json({ error: msg, detail: lastErr?.detail ?? "" }, s);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
