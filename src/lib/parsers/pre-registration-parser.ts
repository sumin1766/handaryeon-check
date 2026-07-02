// 사전접수 텍스트 파서 (강화판)
// - 다양한 구분자·항목 번호 정규화
// - 담당자 이름/전화 견고한 추출
// - 명단에서 "진짜 이름"만 추출, 부가정보(학년/직분/괄호)는 비고로 분리
// - 인원수/명단 교차검증, 인원수 미기재 시 명단수로 자동 채움
// - 제외된 토큰은 excluded 로 노출

export type CategoryKey =
  | "male_student"
  | "female_student"
  | "male_adult"
  | "female_adult";

export type Person = { name: string; note?: string };

export type CategoryBucket = {
  lodging_count: number;
  non_lodging_count: number;
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
  excluded: string[];
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
  { key: "male_student", rx: /남\s*학\s*생/ },
  { key: "female_student", rx: /여\s*학\s*생/ },
  { key: "male_adult", rx: /남\s*자\s*어른/ },
  { key: "female_adult", rx: /여\s*자\s*어른/ },
];

const TITLE_WORDS = [
  "전도사", "목사", "사모", "교역자", "교사",
  "집사", "권사", "장로", "청년",
];

// ─── 전처리 ───────────────────────────────────────────────────────
// 원문자 → (숫자), 각종 구분자 → "-", 불필요한 기호/이모지 제거
function normalizeText(input: string): string {
  return input
    // ①②③④⑤ → (1)(2)(3)(4)(5)
    .replace(/[①-⑨]/g, (m) => `(${m.charCodeAt(0) - 0x2460 + 1})`)
    // 다양한 구분자 통일 (ㅡ, →, ▶, ►, », · 등 → "-")
    .replace(/[ㅡ―—–ー→▶►»]/g, "-")
    // NBSP → space
    .replace(/\u00a0/g, " ")
    // 이모지 / 특수 하트/별 계열 제거
    .replace(/[♡♥♪★☆✔✓✿❤]/g, " ")
    .replace(/\^\^|\^_\^|~+/g, " ")
    // Zero-width
    .replace(/[\u200B-\u200F\uFEFF]/g, "");
}

function detectCategory(line: string): CategoryKey | null {
  for (const c of CATEGORY_KEYWORDS) if (c.rx.test(line)) return c.key;
  return null;
}

// ─── 전화번호 추출 ────────────────────────────────────────────────
function extractPhone(text: string): string | null {
  const rx = /(0\d{1,2})[\s\-.]?(\d{3,4})[\s\-.]?(\d{4})/g;
  const m = rx.exec(text);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

// ─── 이름/비고 분리 ───────────────────────────────────────────────
// 하나의 "사람 토큰"을 {name, note}로 나눈다. 이름 후보가 없으면 null.
const HANGUL = /[가-힣]/;
const NAME_RX = /^([가-힣]{2,4})/;

function isRejectedToken(t: string): boolean {
  const s = t.trim();
  if (!s) return true;
  if (/^0+$/.test(s)) return true;
  if (/^없음$/.test(s)) return true;
  // 인원수 표기
  if (/^(숙박|비숙박)?\s*\d+\s*명$/.test(s)) return true;
  if (/^\d+명$/.test(s)) return true;
  // 라벨
  if (/^(숙박자|비숙박자|명단|이름|작성|인원|합계)/.test(s)) return true;
  // 문장/메모 (10자 이상 & 서술 어미/기관어 키워드) — 이름과 겹치기 쉬운 짧은 조각은 제외
  if (
    s.length >= 10 &&
    /(입금|취소|홈페이지|주세요|바랍니|드립니|해주세|합니다|되었|되겠|되나요|입니다)/.test(s)
  ) {
    return true;
  }
  // 한글 이름 후보가 아예 없다
  if (!HANGUL.test(s)) return true;
  return false;
}

function splitPerson(rawToken: string): { person: Person | null; rejected: boolean } {
  let t = rawToken.replace(/^[\s\-:>·]+|[\s\-:>·]+$/g, "");
  t = t.replace(/^본인$/, "").trim();
  if (!t) return { person: null, rejected: false };
  if (isRejectedToken(t)) return { person: null, rejected: true };

  // 괄호부 분리: 첫 괄호 앞을 이름 후보, 괄호 내부는 note
  let baseNote = "";
  const paren = t.match(/^([^()]*?)\s*\(([^)]*)\)\s*(.*)$/);
  let head = t;
  let tail = "";
  if (paren) {
    head = paren[1].trim();
    baseNote = paren[2].trim();
    tail = paren[3].trim();
  }

  // head 에서 앞쪽 한글 2~4자 = 이름
  const nm = head.match(NAME_RX);
  if (!nm) return { person: null, rejected: true };
  const name = nm[1];
  let rest = head.slice(nm[1].length).trim();
  // 흔한 접미어 제거
  rest = rest.replace(/^본인$/, "").trim();

  // note 조합: 괄호 안 + head 잔여 + 괄호 뒤 잔여
  const noteParts = [baseNote, rest, tail]
    .map((s) => s.trim())
    .filter((s) => s && s !== "본인");
  // 잔여 부분에서 title/grade 이외의 텍스트는 그대로 note로 둔다
  const note = noteParts.join(" ").replace(/\s{2,}/g, " ").trim();

  return { person: { name, note: note || undefined }, rejected: false };
}

// 텍스트 → 토큰들(사람 후보). 공백 1칸은 같은 사람으로 본다.
// 구분자: 줄바꿈, 콤마, 세미콜론, "/", 2칸+ 공백, 슬래시(단, 010/xxxx 같은 경우도 있지만 이름부는 안전)
function tokenize(text: string): string[] {
  // 괄호를 유지하면서 splitting
  const tokens: string[] = [];
  let buf = "";
  let depth = 0;
  const flush = () => {
    if (buf.trim()) tokens.push(buf.trim());
    buf = "";
  };
  const chars = Array.from(text);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === "(") { depth++; buf += ch; continue; }
    if (ch === ")") { depth = Math.max(0, depth - 1); buf += ch; continue; }
    if (depth > 0) { buf += ch; continue; }
    if (ch === "\n" || ch === "," || ch === "、" || ch === "，" || ch === ";" || ch === "/") {
      flush();
      continue;
    }
    // 2칸+ 공백 = 구분자
    if (ch === " " || ch === "\t") {
      if (chars[i + 1] === " " || chars[i + 1] === "\t") {
        flush();
        while (chars[i + 1] === " " || chars[i + 1] === "\t") i++;
        continue;
      }
      // 이름(2-4 한글) + 공백 + 직분 키워드 인 경우 → 같은 사람으로 유지
      // 이름(2-4 한글) + 공백 + 다음 이름(2-4 한글) → 다른 사람으로 분리
      // 결정: 이미 buf에 이름 형태가 있고, 뒤의 다음 토큰이 title/grade가 아니면 분리
      const trimmed = buf.trim();
      // 이름 단독, 또는 "이름(부가정보)" 형태면 다음이 사람일 가능성 검사
      const isNameOnly = /^[가-힣]{2,4}(\s*\([^)]*\))?$/.test(trimmed);
      if (isNameOnly) {
        // peek 다음 단어
        let j = i + 1;
        while (chars[j] === " " || chars[j] === "\t") j++;
        let nextWord = "";
        while (j < chars.length && !/[\s,、，;/\n()]/.test(chars[j])) {
          nextWord += chars[j]; j++;
        }
        const isTitle = TITLE_WORDS.some((w) => nextWord.startsWith(w));
        const isGrade = /^(초|중|고|청)([1-6]학년|[1-3])?$|^\d+학년$|^\d+세$/.test(nextWord);
        if (!isTitle && !isGrade && /^[가-힣]{2,4}$/.test(nextWord)) {
          // 두 개의 다른 이름 → 분리
          flush();
          continue;
        }
      }
      buf += " ";
      continue;
    }
    buf += ch;
  }
  flush();
  return tokens;
}

function parseNames(raw: string): { people: Person[]; rejected: string[] } {
  const people: Person[] = [];
  const rejected: string[] = [];
  const cleaned = raw
    .replace(/^[\s\-:>·]+/, "")
    .replace(/\s+본인$/g, "")
    .trim();
  if (!cleaned) return { people, rejected };
  if (/^0+$/.test(cleaned) || cleaned === "없음") return { people, rejected };

  const tokens = tokenize(cleaned);
  for (const t of tokens) {
    const r = splitPerson(t);
    if (r.person) people.push(r.person);
    else if (r.rejected && t.trim()) rejected.push(t.trim());
  }
  // dedupe by name+note
  const seen = new Set<string>();
  const dedup = people.filter((p) => {
    const k = p.name + "|" + (p.note ?? "");
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  return { people: dedup, rejected };
}

// ─── 인원수 라인 파싱 ─────────────────────────────────────────────
// "숙박 3명, 비숙박 0명" / "숙박: 3" / "숙박   명" (미기재)
function extractCounts(line: string): {
  lodging?: number;
  nonLodging?: number;
  lodgingSpecified: boolean;
  nonLodgingSpecified: boolean;
} {
  const out: any = { lodgingSpecified: false, nonLodgingSpecified: false };
  const ml = line.match(/숙박[^\d비]*(\d+)\s*명?/);
  const mn = line.match(/비숙박[^\d]*(\d+)\s*명?/);
  if (ml) { out.lodging = parseInt(ml[1], 10); out.lodgingSpecified = true; }
  if (mn) { out.nonLodging = parseInt(mn[1], 10); out.nonLodgingSpecified = true; }
  return out;
}

// ─── 메인 파서 ───────────────────────────────────────────────────
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
    excluded: [],
  };

  if (!input || !input.trim()) return result;
  const src = normalizeText(input);
  const lines = src.split(/\r?\n/);

  // count-specified 트래킹
  const specified: Record<CategoryKey, { lodging: boolean; non_lodging: boolean }> = {
    male_student: { lodging: false, non_lodging: false },
    female_student: { lodging: false, non_lodging: false },
    male_adult: { lodging: false, non_lodging: false },
    female_adult: { lodging: false, non_lodging: false },
  };

  // ── 헤더: 교회 / 담당자 ─────────────────────────────────────
  // 담당자 블록: 담당자/인솔자/연락처 키워드가 등장한 라인부터 다음 카테고리 라인 전까지 결합
  let contactBlock = "";
  let inContact = false;

  for (let idx = 0; idx < lines.length; idx++) {
    const line = lines[idx];
    // 교회명 / 교단
    const mChurch = line.match(/교회\s*이?름?.*?[-:]\s*(.+)/);
    if (mChurch && !result.church_name) {
      const v = mChurch[1].trim();
      const mp = v.match(/^([^()]+?)\s*\(([^)]+)\)\s*$/);
      if (mp) {
        result.church_name = mp[1].trim();
        result.denomination = mp[2].trim();
      } else {
        result.church_name = v;
      }
      continue;
    }

    // 담당자 블록 시작
    if (/담당자|인솔자|연락처|이름\s*및\s*연락처/.test(line)) {
      inContact = true;
      const after = line.split(/[-:]/).slice(1).join(":").trim();
      if (after) contactBlock += " " + after;
      continue;
    }
    // 담당자 블록 계속(다음 항목 번호 or 카테고리 헤더 전까지)
    if (inContact) {
      if (/^\s*(\(?\d+[-.\)]|3\.|3\)|카테고리|남학생|여학생|남자어른|여자어른)/.test(line)) {
        inContact = false;
      } else {
        contactBlock += " " + line;
      }
    }
  }

  // 담당자 블록에서 phone + name 추출
  if (contactBlock.trim()) {
    const ph = extractPhone(contactBlock);
    if (ph) result.phone = ph;
    // 이름 후보: 전화 제거 + 슬래시/쉼표 → 공백
    let s = contactBlock.replace(/(0\d{1,2})[\s\-.]?(\d{3,4})[\s\-.]?(\d{4})/g, " ");
    s = s.replace(/[\/,]/g, " ").replace(/\s+/g, " ").trim();
    // 첫 한글 2~4자를 이름으로 채택하되, 뒤에 붙은 직분 제거
    // 이름 뒤에 붙는 직분을 최소 매칭으로 먼저 시도 (예: "최애정전도사" → "최애정")
    const TITLE_RX = /(전도사|목사|사모|교역자|교사|집사|권사|장로|본인)/;
    let picked: string | null = null;
    for (let len = 4; len >= 2; len--) {
      const rx = new RegExp(`([가-힣]{${len}})(?:${TITLE_RX.source}|\\s|$)`);
      const m = s.match(rx);
      if (m && /전도사|목사|사모|교역자|교사|집사|권사|장로|본인/.test(s.slice(m.index! + len, m.index! + len + 4))) {
        picked = m[1];
        break;
      }
    }
    if (!picked) {
      const mName = s.match(/([가-힣]{2,4})/);
      if (mName) picked = mName[1];
    }
    if (picked) result.contact_name = picked;
  }
  // fallback: 전화 없으면 전체 텍스트에서 첫 번호
  if (!result.phone) {
    const p = extractPhone(src);
    if (p) result.phone = p;
  }

  // ── 카테고리 & 명단 ────────────────────────────────────────
  let currentCat: CategoryKey | null = null;
  let listMode: "none" | "lodging" | "non_lodging" = "none";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!trimmed) continue;

    const cat = detectCategory(trimmed);
    // 카테고리 헤더 + 인원수: "(1)남학생(초중고청) - 숙박 0명, 비숙박 2명"
    if (cat && /숙박/.test(trimmed) && /\d/.test(trimmed) && !/자\s*[-:]/.test(trimmed)) {
      const counts = extractCounts(trimmed);
      if (counts.lodging != null) result.categories[cat].lodging_count = counts.lodging;
      if (counts.nonLodging != null) result.categories[cat].non_lodging_count = counts.nonLodging;
      if (counts.lodgingSpecified) specified[cat].lodging = true;
      if (counts.nonLodgingSpecified) specified[cat].non_lodging = true;
      currentCat = cat;
      listMode = "none";
      continue;
    }
    // 명단 헤더
    if (cat && /명단/.test(trimmed)) {
      currentCat = cat;
      listMode = "none";
      continue;
    }
    // 카테고리만 언급
    if (cat && !/숙박/.test(trimmed) && !/명단/.test(trimmed)) {
      currentCat = cat;
      listMode = "none";
      continue;
    }

    if (currentCat) {
      const ml = trimmed.match(/^숙박자\s*[-:>·]?\s*(.*)$/);
      const mn = trimmed.match(/^비숙박자\s*[-:>·]?\s*(.*)$/);
      if (mn) {
        listMode = "non_lodging";
        const { people, rejected } = parseNames(mn[1] ?? "");
        result.categories[currentCat].non_lodging_names.push(...people);
        result.excluded.push(...rejected);
        continue;
      }
      if (ml) {
        listMode = "lodging";
        const { people, rejected } = parseNames(ml[1] ?? "");
        result.categories[currentCat].lodging_names.push(...people);
        result.excluded.push(...rejected);
        continue;
      }
      // 이어지는 줄 (숫자 항목이 아닌 경우)
      if (listMode !== "none" && !/^\(?\d/.test(trimmed) && !/^[0-9]+\./.test(trimmed)) {
        const { people, rejected } = parseNames(trimmed);
        if (listMode === "lodging")
          result.categories[currentCat].lodging_names.push(...people);
        else
          result.categories[currentCat].non_lodging_names.push(...people);
        result.excluded.push(...rejected);
      }
    }
  }

  // ── 인원수 미기재 자동 채움 & 교차검증 ────────────────────────
  for (const k of Object.keys(result.categories) as CategoryKey[]) {
    const b = result.categories[k];
    if (!specified[k].lodging && b.lodging_names.length > 0) {
      b.lodging_count = b.lodging_names.length;
    }
    if (!specified[k].non_lodging && b.non_lodging_names.length > 0) {
      b.non_lodging_count = b.non_lodging_names.length;
    }
    if (b.lodging_names.length !== b.lodging_count) {
      result.warnings.push(
        `${CATEGORY_LABELS[k]} 숙박: 신고 ${b.lodging_count}명 / 명단 ${b.lodging_names.length}명 — 확인 필요`,
      );
    }
    if (b.non_lodging_names.length !== b.non_lodging_count) {
      result.warnings.push(
        `${CATEGORY_LABELS[k]} 비숙박: 신고 ${b.non_lodging_count}명 / 명단 ${b.non_lodging_names.length}명 — 확인 필요`,
      );
    }
  }

  // dedupe excluded
  result.excluded = Array.from(new Set(result.excluded));

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
