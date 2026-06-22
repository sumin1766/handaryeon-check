// 사전접수 텍스트 파서. 양식 변경 시 이 파일만 수정.
// 입력 텍스트에서 교회/담당자/연락처/8개 인원 항목/명단을 추출한다.

export type CategoryKey =
  | "male_student"
  | "female_student"
  | "male_adult"
  | "female_adult";

export type Person = { name: string; note?: string };

export type CategoryBucket = {
  lodging_count: number; // 입력 숫자(숙박)
  non_lodging_count: number; // 입력 숫자(비숙박)
  lodging_names: Person[];
  non_lodging_names: Person[];
};

export type ParsedRegistration = {
  church_name: string;
  denomination: string;
  contact_name: string;
  phone: string;
  categories: Record<CategoryKey, CategoryBucket>;
  warnings: string[];
};

const emptyBucket = (): CategoryBucket => ({
  lodging_count: 0,
  non_lodging_count: 0,
  lodging_names: [],
  non_lodging_names: [],
});

export const CATEGORY_LABELS: Record<CategoryKey, string> = {
  male_student: "남학생",
  female_student: "여학생",
  male_adult: "남자어른",
  female_adult: "여자어른",
};

export const CATEGORY_META: Record<
  CategoryKey,
  { gender: "M" | "F"; age_group: "student" | "adult" }
> = {
  male_student: { gender: "M", age_group: "student" },
  female_student: { gender: "F", age_group: "student" },
  male_adult: { gender: "M", age_group: "adult" },
  female_adult: { gender: "F", age_group: "adult" },
};

const CATEGORY_KEYWORDS: { key: CategoryKey; rx: RegExp }[] = [
  { key: "male_student", rx: /남\s*학생/ },
  { key: "female_student", rx: /여\s*학생/ },
  { key: "male_adult", rx: /남\s*자\s*어른/ },
  { key: "female_adult", rx: /여\s*자\s*어른/ },
];

function detectCategory(line: string): CategoryKey | null {
  for (const c of CATEGORY_KEYWORDS) if (c.rx.test(line)) return c.key;
  return null;
}

function parseNames(raw: string): Person[] {
  if (!raw) return [];
  const cleaned = raw
    .replace(/^[\s\-:>]+/, "")
    .replace(/\s+본인$/g, "")
    .trim();
  if (!cleaned || /^0+$/.test(cleaned) || cleaned === "없음") return [];
  // split on whitespace/comma/newline, but keep "(...)" attached to preceding name
  const tokens: string[] = [];
  let buf = "";
  let depth = 0;
  for (const ch of cleaned) {
    if (ch === "(") {
      depth++;
      buf += ch;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
      buf += ch;
    } else if (depth === 0 && /[\s,]/.test(ch)) {
      if (buf) tokens.push(buf);
      buf = "";
    } else {
      buf += ch;
    }
  }
  if (buf) tokens.push(buf);
  const people: Person[] = [];
  for (let t of tokens) {
    t = t.replace(/^본인$/, "").trim();
    if (!t || t === "0") continue;
    const m = t.match(/^(.+?)\s*\(([^)]*)\)\s*$/);
    if (m) people.push({ name: m[1].trim(), note: m[2].trim() });
    else people.push({ name: t });
  }
  // dedupe by name+note
  const seen = new Set<string>();
  return people.filter((p) => {
    const k = p.name + "|" + (p.note ?? "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function extractCounts(line: string): { lodging?: number; nonLodging?: number } {
  // matches "숙박 3명" / "숙박: 3" / "비숙박 0명"
  const out: { lodging?: number; nonLodging?: number } = {};
  const ml = line.match(/숙박[^\d\-]*(\d+)/);
  const mn = line.match(/비숙박[^\d\-]*(\d+)/);
  if (ml) out.lodging = parseInt(ml[1], 10);
  if (mn) out.nonLodging = parseInt(mn[1], 10);
  return out;
}

export function parsePreRegistration(input: string): ParsedRegistration {
  const result: ParsedRegistration = {
    church_name: "",
    denomination: "",
    contact_name: "",
    phone: "",
    categories: {
      male_student: emptyBucket(),
      female_student: emptyBucket(),
      male_adult: emptyBucket(),
      female_adult: emptyBucket(),
    },
    warnings: [],
  };

  if (!input || !input.trim()) return result;
  const lines = input.split(/\r?\n/);

  // ─── header info ──────────────────────────────────────────────
  for (const line of lines) {
    // 교회이름(교단) - 광주새순교회(합동)
    const m1 = line.match(/교회\s*이름.*?[-:]\s*(.+)/);
    if (m1) {
      const v = m1[1].trim();
      const m = v.match(/^([^()]+?)\s*\(([^)]+)\)\s*$/);
      if (m) {
        result.church_name = m[1].trim();
        result.denomination = m[2].trim();
      } else {
        result.church_name = v;
      }
    }
    // 담당자 - 이에스더 010-3170-3048
    if (/담당자|인솔자|연락처/.test(line) && /[-:]/.test(line)) {
      const after = line.split(/[-:]/).slice(1).join("-").trim();
      const phoneMatch = after.match(/(01[016789][-\s.]?\d{3,4}[-\s.]?\d{4})/);
      if (phoneMatch) {
        result.phone = phoneMatch[1].replace(/\s|\./g, "-");
        const name = after.replace(phoneMatch[1], "").replace(/[\/,]/g, " ").trim();
        if (name && !result.contact_name) result.contact_name = name.split(/\s+/)[0];
      } else if (!result.contact_name) {
        const name = after.split(/\s+/)[0];
        if (name && name.length <= 6) result.contact_name = name;
      }
    }
  }

  // ─── categories ───────────────────────────────────────────────
  let currentCat: CategoryKey | null = null;
  let listMode: "none" | "lodging" | "non_lodging" = "none";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    // category header w/ counts: "(1)남학생(초중고청) - 숙박 0명, 비숙박 2명"
    const cat = detectCategory(trimmed);
    if (cat && /숙박/.test(trimmed) && /명|\d/.test(trimmed)) {
      const counts = extractCounts(trimmed);
      if (counts.lodging != null)
        result.categories[cat].lodging_count = counts.lodging;
      if (counts.nonLodging != null)
        result.categories[cat].non_lodging_count = counts.nonLodging;
      // possibly inline names? unlikely — skip
      currentCat = cat;
      listMode = "none";
      continue;
    }
    // category list header: "(1-1)남학생 명단"
    if (cat && /명단/.test(trimmed)) {
      currentCat = cat;
      listMode = "none";
      continue;
    }
    // sub line: "숙박자 - 이신우(6학년) 이인우(4학년)"
    if (currentCat) {
      const ml = trimmed.match(/^숙박자\s*[-:]?\s*(.*)$/);
      const mn = trimmed.match(/^비숙박자\s*[-:]?\s*(.*)$/);
      if (ml) {
        listMode = "lodging";
        const names = parseNames(ml[1] ?? "");
        result.categories[currentCat].lodging_names.push(...names);
        continue;
      }
      if (mn) {
        listMode = "non_lodging";
        const names = parseNames(mn[1] ?? "");
        result.categories[currentCat].non_lodging_names.push(...names);
        continue;
      }
      // continuation line for current list mode (no header), only when starts with space or no numbering
      if (listMode !== "none" && !/^\(?\d/.test(trimmed) && !/^[0-9]+\./.test(trimmed)) {
        const names = parseNames(trimmed);
        if (listMode === "lodging")
          result.categories[currentCat].lodging_names.push(...names);
        else result.categories[currentCat].non_lodging_names.push(...names);
      }
    }
  }

  // ─── validation warnings ──────────────────────────────────────
  for (const k of Object.keys(result.categories) as CategoryKey[]) {
    const b = result.categories[k];
    if (b.lodging_names.length !== b.lodging_count) {
      result.warnings.push(
        `${CATEGORY_LABELS[k]} 숙박: 입력 ${b.lodging_count}명 vs 명단 ${b.lodging_names.length}명 불일치`,
      );
    }
    if (b.non_lodging_names.length !== b.non_lodging_count) {
      result.warnings.push(
        `${CATEGORY_LABELS[k]} 비숙박: 입력 ${b.non_lodging_count}명 vs 명단 ${b.non_lodging_names.length}명 불일치`,
      );
    }
  }

  return result;
}

export function totalCounts(p: ParsedRegistration) {
  let lodging = 0;
  let nonLodging = 0;
  for (const k of Object.keys(p.categories) as CategoryKey[]) {
    lodging += p.categories[k].lodging_count;
    nonLodging += p.categories[k].non_lodging_count;
  }
  return { lodging, nonLodging, total: lodging + nonLodging };
}
