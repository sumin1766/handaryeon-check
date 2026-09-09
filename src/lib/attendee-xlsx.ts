// 참석자 명단 엑셀 템플릿 생성 + 업로드 파싱 (전부 브라우저에서 처리).
// 서버는 엑셀 파일을 직접 읽지 않는다.
import {
  MEMBER_CATEGORIES,
  CATEGORY_LABELS,
  ALL_MEMBER_CATEGORIES,
  isPhoneOptional,
  type AnyMemberCategory,
} from "@/lib/member-categories";

export type LodgingType = "church" | "external" | "none";
export type ParsedAttendee = {
  name: string;
  phone: string;
  lodging_type: LodgingType;
  category: AnyMemberCategory;
};

export const LODGING_LABELS: Record<LodgingType, string> = {
  church: "교회숙박",
  external: "외부숙박",
  none: "비숙박",
};

const norm = (s: unknown) =>
  String(s ?? "")
    .replace(/[（）]/g, (m) => (m === "（" ? "(" : ")"))
    .replace(/\s+/g, "")
    .trim();

const CATEGORY_BY_LABEL = new Map<string, AnyMemberCategory>();
for (const c of ALL_MEMBER_CATEGORIES) {
  CATEGORY_BY_LABEL.set(norm(CATEGORY_LABELS[c]), c);
  CATEGORY_BY_LABEL.set(norm(c), c);
}
// 관대한 별칭
const CATEGORY_ALIASES: Record<string, AnyMemberCategory> = {
  "남학생": "male_student",
  "여학생": "female_student",
  "남자어른": "male_adult",
  "여자어른": "female_adult",
  "남아": "male_infant",
  "여아": "female_infant",
  "남자유아유치": "male_infant",
  "여자유아유치": "female_infant",
  "남자초등": "male_elementary",
  "여자초등": "female_elementary",
  "남학생초등": "male_elementary",
  "여학생초등": "female_elementary",
};

export function categoryFromLabel(raw: unknown): AnyMemberCategory | null {
  const k = norm(raw);
  if (!k) return null;
  return CATEGORY_BY_LABEL.get(k) ?? CATEGORY_ALIASES[k] ?? null;
}

const LODGING_ALIASES: Record<string, LodgingType> = {
  "교회숙박": "church",
  "교회": "church",
  "church": "church",
  "외부숙박": "external",
  "외부": "external",
  "external": "external",
  "비숙박": "none",
  "숙박안함": "none",
  "none": "none",
};

export function lodgingFromLabel(raw: unknown): LodgingType | null {
  const k = norm(raw).toLowerCase();
  if (!k) return "church";
  return LODGING_ALIASES[k] ?? LODGING_ALIASES[norm(raw)] ?? null;
}

const GUIDE =
  "작성 안내: 3행부터 입력하세요. 분류·숙박유형은 드롭다운에서 선택합니다. 전화번호는 남아(유아유치)·여아(유아유치)만 생략 가능하고 나머지 분류는 필수입니다. 이름이 비어 있는 행은 무시됩니다.";

/** 템플릿 파일을 만들어 즉시 내려받는다. */
export async function downloadAttendeeTemplate(fileName = "참석자명단_템플릿.xlsx") {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("참석자명단");

  ws.columns = [
    { header: "", key: "name", width: 16 },
    { header: "", key: "category", width: 20 },
    { header: "", key: "phone", width: 20 },
    { header: "", key: "lodging", width: 14 },
  ];

  ws.mergeCells("A1:D1");
  const guide = ws.getCell("A1");
  guide.value = GUIDE;
  guide.alignment = { wrapText: true, vertical: "middle" };
  guide.font = { name: "Arial", size: 10 };
  ws.getRow(1).height = 46;

  const head = ws.getRow(2);
  head.values = ["이름", "분류", "전화번호", "숙박유형"];
  head.font = { name: "Arial", bold: true };

  const categoryList = `"${MEMBER_CATEGORIES.map((c) => CATEGORY_LABELS[c]).join(",")}"`;
  const lodgingList = `"${Object.values(LODGING_LABELS).join(",")}"`;

  for (let r = 3; r <= 202; r++) {
    ws.getCell(`B${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [categoryList],
      showErrorMessage: true,
      errorTitle: "분류 선택",
      error: "목록에서 분류를 선택해 주세요.",
    };
    ws.getCell(`D${r}`).dataValidation = {
      type: "list",
      allowBlank: true,
      formulae: [lodgingList],
      showErrorMessage: true,
      errorTitle: "숙박유형 선택",
      error: "목록에서 숙박유형을 선택해 주세요.",
    };
    ws.getCell(`C${r}`).numFmt = "@";
  }

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(
    new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export type ParseResult = {
  rows: ParsedAttendee[];
  errors: string[];
  skipped: number;
};

const cellText = (v: unknown): string => {
  if (v == null) return "";
  if (typeof v === "object") {
    const o = v as { text?: unknown; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((t) => t.text).join("");
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    return "";
  }
  return String(v);
};

/** 업로드된 엑셀을 브라우저에서 파싱한다. */
export async function parseAttendeeWorkbook(file: File): Promise<ParseResult> {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  const rows: ParsedAttendee[] = [];
  const errors: string[] = [];
  let skipped = 0;
  if (!ws) return { rows, errors: ["시트를 찾을 수 없습니다."], skipped };

  ws.eachRow((row, rowNumber) => {
    const name = cellText(row.getCell(1).value).trim();
    const categoryRaw = cellText(row.getCell(2).value).trim();
    const phone = cellText(row.getCell(3).value).trim();
    const lodgingRaw = cellText(row.getCell(4).value).trim();

    if (!name || name === "이름") return;
    if (norm(name) === norm(GUIDE.slice(0, 6))) return;

    const category = categoryFromLabel(categoryRaw);
    if (!category) {
      errors.push(`${rowNumber}행: 알 수 없는 분류 "${categoryRaw || "(빈칸)"}"`);
      skipped++;
      return;
    }
    const lodging_type = lodgingFromLabel(lodgingRaw);
    if (!lodging_type) {
      errors.push(`${rowNumber}행: 알 수 없는 숙박유형 "${lodgingRaw}"`);
      skipped++;
      return;
    }
    if (!phone && !isPhoneOptional(category)) {
      errors.push(`${rowNumber}행: ${CATEGORY_LABELS[category]}은(는) 전화번호가 필수입니다.`);
      skipped++;
      return;
    }
    rows.push({ name, phone, lodging_type, category });
  });

  return { rows, errors, skipped };
}
