// LLM parser client — calls parse-preregistration edge function, maps to ParsedRegistration
import { supabase } from "@/integrations/supabase/client";
import {
  parsePreRegistration,
  type ParsedRegistration,
  type CategoryKey,
  type Person,
} from "@/lib/parsers/pre-registration-parser";

type LlmBucket = { overnight?: any[]; day?: any[] };
type LlmResult = {
  church_name?: string;
  denomination?: string;
  manager_name?: string;
  manager_phone?: string;
  male_student?: LlmBucket;
  female_student?: LlmBucket;
  male_adult?: LlmBucket;
  female_adult?: LlmBucket;
  excluded?: any[];
};

const KEYS: CategoryKey[] = ["male_student", "female_student", "male_adult", "female_adult"];

function normalizePhone(raw: string): string {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  const m = digits.match(/^(0\d{1,2})(\d{3,4})(\d{4})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return String(raw).trim();
}

function normalizePerson(p: any): Person | null {
  if (!p) return null;
  if (typeof p === "string") {
    const name = p.trim().match(/[가-힣]{2,4}/)?.[0];
    if (!name) return null;
    return { name };
  }
  const rawName = String(p.name ?? "").trim();
  const nm = rawName.match(/[가-힣]{2,4}/)?.[0];
  if (!nm) return null;
  const note = String(p.note ?? "").trim();
  return note ? { name: nm, note } : { name: nm };
}

function normalizeList(arr: any[] | undefined): Person[] {
  if (!Array.isArray(arr)) return [];
  const out: Person[] = [];
  for (const item of arr) {
    const person = normalizePerson(item);
    if (!person) continue;
    // dedupe 하지 않음: 동명이인 보존 (진짜 중복은 중복 교회 감지에서 처리)
    out.push(person);
  }
  return out;
}

export function mapLlmToParsed(llm: LlmResult): ParsedRegistration {
  const parsed: ParsedRegistration = {
    church_name: String(llm.church_name ?? "").trim(),
    denomination: String(llm.denomination ?? "").trim(),
    contact_name: String(llm.manager_name ?? "").trim(),
    phone: normalizePhone(String(llm.manager_phone ?? "")),
    categories: {
      male_student: { lodging_count: 0, non_lodging_count: 0, lodging_names: [], non_lodging_names: [] },
      female_student: { lodging_count: 0, non_lodging_count: 0, lodging_names: [], non_lodging_names: [] },
      male_adult: { lodging_count: 0, non_lodging_count: 0, lodging_names: [], non_lodging_names: [] },
      female_adult: { lodging_count: 0, non_lodging_count: 0, lodging_names: [], non_lodging_names: [] },
    },
    warnings: [],
    excluded: [],
  };
  for (const k of KEYS) {
    const b = (llm as any)[k] as LlmBucket | undefined;
    const lodging = normalizeList(b?.overnight);
    const nonLodging = normalizeList(b?.day);
    parsed.categories[k].lodging_names = lodging;
    parsed.categories[k].non_lodging_names = nonLodging;
    parsed.categories[k].lodging_count = lodging.length;
    parsed.categories[k].non_lodging_count = nonLodging.length;
  }
  if (Array.isArray(llm.excluded)) {
    parsed.excluded = Array.from(
      new Set(llm.excluded.map((x) => String(x).trim()).filter(Boolean)),
    );
  }
  return parsed;
}

// Merge reported counts from the raw text into LLM-parsed result and emit warnings on mismatch.
function applyCountCrossCheck(parsed: ParsedRegistration, sourceText: string) {
  const src = sourceText || "";
  const catRegex: Record<CategoryKey, RegExp> = {
    male_student: /남\s*학\s*생[^\n]*?(?:숙박[^\d]*(\d+)[^\n]*?비숙박[^\d]*(\d+)|비숙박[^\d]*(\d+)[^\n]*?숙박[^\d]*(\d+))/,
    female_student: /여\s*학\s*생[^\n]*?(?:숙박[^\d]*(\d+)[^\n]*?비숙박[^\d]*(\d+)|비숙박[^\d]*(\d+)[^\n]*?숙박[^\d]*(\d+))/,
    male_adult: /남\s*자\s*어른[^\n]*?(?:숙박[^\d]*(\d+)[^\n]*?비숙박[^\d]*(\d+)|비숙박[^\d]*(\d+)[^\n]*?숙박[^\d]*(\d+))/,
    female_adult: /여\s*자\s*어른[^\n]*?(?:숙박[^\d]*(\d+)[^\n]*?비숙박[^\d]*(\d+)|비숙박[^\d]*(\d+)[^\n]*?숙박[^\d]*(\d+))/,
  };
  const labels: Record<CategoryKey, string> = {
    male_student: "남학생",
    female_student: "여학생",
    male_adult: "남자어른",
    female_adult: "여자어른",
  };
  for (const k of KEYS) {
    const m = src.match(catRegex[k]);
    if (!m) continue;
    const lodging = m[1] != null ? parseInt(m[1], 10) : m[4] != null ? parseInt(m[4], 10) : NaN;
    const nonLodging = m[2] != null ? parseInt(m[2], 10) : m[3] != null ? parseInt(m[3], 10) : NaN;
    const b = parsed.categories[k];
    if (!Number.isNaN(lodging)) {
      if (b.lodging_names.length !== lodging) {
        parsed.warnings.push(`${labels[k]} 숙박: 신고 ${lodging}명 / 명단 ${b.lodging_names.length}명 — 확인 필요`);
      }
      b.lodging_count = Math.max(b.lodging_count, lodging);
    }
    if (!Number.isNaN(nonLodging)) {
      if (b.non_lodging_names.length !== nonLodging) {
        parsed.warnings.push(`${labels[k]} 비숙박: 신고 ${nonLodging}명 / 명단 ${b.non_lodging_names.length}명 — 확인 필요`);
      }
      b.non_lodging_count = Math.max(b.non_lodging_count, nonLodging);
    }
  }
}

export type ParseStage = "rule" | "primary" | "backup";
export type ParseSource = "llm" | "rule";
export type ParseOutcome = {
  parsed: ParsedRegistration;
  source: ParseSource;
  stage: ParseStage;
  model?: string;
  error?: string;
};

export async function parseWithLlmOrFallback(text: string): Promise<ParseOutcome> {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return { parsed: parsePreRegistration(trimmed), source: "rule", stage: "rule" };
  try {
    const { data, error } = await supabase.functions.invoke("parse-preregistration", {
      body: { text: trimmed },
    });
    if (error) throw error;
    if (!data?.ok || !data?.data) {
      throw new Error(data?.error ?? "LLM 응답 없음");
    }
    const parsed = mapLlmToParsed(data.data as LlmResult);
    applyCountCrossCheck(parsed, trimmed);
    const stage: ParseStage = data.stage === "backup" ? "backup" : "primary";
    return { parsed, source: "llm", stage, model: data.model };
  } catch (e: any) {
    const parsed = parsePreRegistration(trimmed);
    return { parsed, source: "rule", stage: "rule", error: e?.message ?? String(e) };
  }
}
