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
// Supports multiple formats:
//   "남학생 - 숙박 5명, 비숙박 3명"
//   "남학생 숙박 총 5명 / 비숙박 총 3명"
//   "숙박 (남) - 42명" / "비숙박 (남) - 12명"
//   "남자어른 비숙박 : 15명"
function applyCountCrossCheck(parsed: ParsedRegistration, sourceText: string) {
  const src = sourceText || "";
  const labels: Record<CategoryKey, string> = {
    male_student: "남학생",
    female_student: "여학생",
    male_adult: "남자어른",
    female_adult: "여자어른",
  };
  const catRx: Record<CategoryKey, RegExp> = {
    male_student: /남\s*학\s*생/,
    female_student: /여\s*학\s*생/,
    male_adult: /남\s*자\s*어른/,
    female_adult: /여\s*자\s*어른/,
  };
  const genderShort: Record<CategoryKey, RegExp> = {
    male_student: /\(\s*남\s*(?:학생|초중고|초중고청)?\s*\)/,
    female_student: /\(\s*여\s*(?:학생|초중고|초중고청)?\s*\)/,
    male_adult: /\(\s*남\s*(?:어른|성인)\s*\)/,
    female_adult: /\(\s*여\s*(?:어른|성인)\s*\)/,
  };

  const declared: Record<CategoryKey, { lodging?: number; nonLodging?: number }> = {
    male_student: {}, female_student: {}, male_adult: {}, female_adult: {},
  };

  const setMax = (k: CategoryKey, kind: "lodging" | "nonLodging", n: number) => {
    if (!Number.isFinite(n)) return;
    const cur = declared[k][kind];
    declared[k][kind] = cur == null ? n : Math.max(cur, n);
  };

  // Pattern A: category header line with both counts.
  //   "남학생 ... 숙박 5명 ... 비숙박 3명" (or reversed)
  for (const k of KEYS) {
    const bothA = new RegExp(catRx[k].source + `[^\\n]*?숙박[^\\d]*(\\d+)[^\\n]*?비숙박[^\\d]*(\\d+)`);
    const bothB = new RegExp(catRx[k].source + `[^\\n]*?비숙박[^\\d]*(\\d+)[^\\n]*?숙박[^\\d]*(\\d+)`);
    const mA = src.match(bothA);
    if (mA) {
      setMax(k, "lodging", parseInt(mA[1], 10));
      setMax(k, "nonLodging", parseInt(mA[2], 10));
      continue;
    }
    const mB = src.match(bothB);
    if (mB) {
      setMax(k, "nonLodging", parseInt(mB[1], 10));
      setMax(k, "lodging", parseInt(mB[2], 10));
    }
  }

  // Pattern B: single count per line.
  //   "남자어른 비숙박 : 15명", "여학생 숙박 총 4명"
  for (const k of KEYS) {
    const lodgingOnly = new RegExp(catRx[k].source + `[^\\n]*?(?<!비)숙박[^\\d\\n]*(\\d+)\\s*명`, "g");
    const nonLodgingOnly = new RegExp(catRx[k].source + `[^\\n]*?비숙박[^\\d\\n]*(\\d+)\\s*명`, "g");
    let m: RegExpExecArray | null;
    while ((m = lodgingOnly.exec(src))) setMax(k, "lodging", parseInt(m[1], 10));
    while ((m = nonLodgingOnly.exec(src))) setMax(k, "nonLodging", parseInt(m[1], 10));
  }

  // Pattern C: flat headers like "숙박 (남) - 42명" / "비숙박 (여) - 12명".
  // These only distinguish gender, not age. Only apply when just one age-group for that gender
  // has any names, to avoid mis-assignment.
  const applyFlat = (gender: "M" | "F", kind: "lodging" | "nonLodging", n: number) => {
    const ks = KEYS.filter((k) => CATEGORY_META_LOCAL[k].gender === gender);
    // Prefer the group that already has names; if only one, assign.
    const withNames = ks.filter((k) => {
      const b = parsed.categories[k];
      return (kind === "lodging" ? b.lodging_names.length : b.non_lodging_names.length) > 0;
    });
    const target = withNames.length === 1 ? withNames[0] : ks.length === 1 ? ks[0] : null;
    if (target) setMax(target, kind, n);
  };
  const flatRx = /(비숙박|숙박)\s*\(?\s*(남|여)\s*[^\)]*\)?\s*[-–:]?\s*(\d+)\s*명/g;
  let fm: RegExpExecArray | null;
  while ((fm = flatRx.exec(src))) {
    const kind = fm[1] === "숙박" ? "lodging" : "nonLodging";
    const gender = fm[2] === "남" ? "M" : "F";
    applyFlat(gender, kind, parseInt(fm[3], 10));
    void genderShort; // reserved for future refinement
  }

  // Emit warnings and reconcile counts.
  for (const k of KEYS) {
    const b = parsed.categories[k];
    const dLodging = declared[k].lodging;
    const dNon = declared[k].nonLodging;
    if (dLodging != null && b.lodging_names.length !== dLodging) {
      parsed.warnings.push(`${labels[k]} 숙박: 명시 ${dLodging}명 / 인식 ${b.lodging_names.length}명 — 확인 필요`);
    }
    if (dNon != null && b.non_lodging_names.length !== dNon) {
      parsed.warnings.push(`${labels[k]} 비숙박: 명시 ${dNon}명 / 인식 ${b.non_lodging_names.length}명 — 확인 필요`);
    }
    if (dLodging != null) b.lodging_count = Math.max(b.lodging_count, dLodging);
    if (dNon != null) b.non_lodging_count = Math.max(b.non_lodging_count, dNon);
  }
}

// local shortcut to avoid circular imports of CATEGORY_META
const CATEGORY_META_LOCAL: Record<CategoryKey, { gender: "M" | "F" }> = {
  male_student: { gender: "M" },
  female_student: { gender: "F" },
  male_adult: { gender: "M" },
  female_adult: { gender: "F" },
};

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
    // The edge function now returns 200 with { ok:false, stage:"rule_fallback", error } when
    // both primary and backup fail, so we should only hit `error` for network/transport issues.
    if (error) throw error;
    if (data?.ok && data?.data) {
      const parsed = mapLlmToParsed(data.data as LlmResult);
      applyCountCrossCheck(parsed, trimmed);
      const stage: ParseStage = data.stage === "backup" ? "backup" : "primary";
      return { parsed, source: "llm", stage, model: data.model };
    }
    // Both LLM stages failed — fall back to rule parser and surface the edge's message.
    const parsed = parsePreRegistration(trimmed);
    return {
      parsed,
      source: "rule",
      stage: "rule",
      error: data?.error ?? "LLM 응답 없음",
    };
  } catch (e: any) {
    const parsed = parsePreRegistration(trimmed);
    return { parsed, source: "rule", stage: "rule", error: e?.message ?? String(e) };
  }
}
