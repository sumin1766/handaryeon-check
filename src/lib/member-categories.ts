// 참석자 분류 8종 정의 + 카테고리별 회비 계산 규칙 (클라이언트/서버 공용, 순수 모듈).
// 저장 코드는 성별+연령대가 드러나도록 정한다.
// 기존 6종 시절에 저장된 male_child / female_child 는 그대로 두고 표시만 지원한다.

/** 신규 입력·수정에서 선택 가능한 8종 (표시 순서 = 이 배열 순서) */
export const MEMBER_CATEGORIES = [
  "male_student",
  "male_adult",
  "female_student",
  "female_adult",
  "male_infant",
  "male_elementary",
  "female_infant",
  "female_elementary",
] as const;
export type MemberCategory = (typeof MEMBER_CATEGORIES)[number];

/** 과거 저장 코드 (선택지에는 노출하지 않고 표시/검증만 허용) */
export const LEGACY_MEMBER_CATEGORIES = ["male_child", "female_child"] as const;
export type LegacyMemberCategory = (typeof LEGACY_MEMBER_CATEGORIES)[number];

export type AnyMemberCategory = MemberCategory | LegacyMemberCategory;

/** zod enum 등 검증용 — 신규 8종 + 과거 2종 */
export const ALL_MEMBER_CATEGORIES = [
  ...MEMBER_CATEGORIES,
  ...LEGACY_MEMBER_CATEGORIES,
] as [AnyMemberCategory, ...AnyMemberCategory[]];

export const CATEGORY_LABELS: Record<AnyMemberCategory, string> = {
  male_student: "남학생(중고청)",
  male_adult: "남자 어른",
  female_student: "여학생(중고청)",
  female_adult: "여자 어른",
  male_infant: "남아(유아유치)",
  male_elementary: "남학생(초등)",
  female_infant: "여아(유아유치)",
  female_elementary: "여학생(초등)",
  // 과거 저장 데이터 — 종전 라벨 유지
  male_child: "남자 유아~초등",
  female_child: "여자 유아~초등",
};

export const categoryLabel = (c: string) =>
  CATEGORY_LABELS[c as AnyMemberCategory] ?? c;

/** 전화번호 생략 가능 — 유아유치 2종 (과거 유아~초등 코드도 관용 허용) */
export const PHONE_OPTIONAL_CATEGORIES: AnyMemberCategory[] = [
  "male_infant",
  "female_infant",
  "male_child",
  "female_child",
];
export const isPhoneOptional = (c: string) =>
  PHONE_OPTIONAL_CATEGORIES.includes(c as AnyMemberCategory);

/** 운영 people 매핑 (성별 / 학생·어른) — 유아·초등은 학생으로 집계 */
export const CATEGORY_PEOPLE_MAP: Record<
  AnyMemberCategory,
  { gender: "M" | "F"; age_group: "student" | "adult"; note?: string }
> = {
  male_student: { gender: "M", age_group: "student" },
  male_adult: { gender: "M", age_group: "adult" },
  female_student: { gender: "F", age_group: "student" },
  female_adult: { gender: "F", age_group: "adult" },
  male_infant: { gender: "M", age_group: "student", note: "유아유치" },
  female_infant: { gender: "F", age_group: "student", note: "유아유치" },
  male_elementary: { gender: "M", age_group: "student", note: "초등" },
  female_elementary: { gender: "F", age_group: "student", note: "초등" },
  male_child: { gender: "M", age_group: "student", note: "유아초등" },
  female_child: { gender: "F", age_group: "student", note: "유아초등" },
};

// ---- 카테고리별 회비 설정 ----

export type CategoryFee = { enabled: boolean; amount: number };
export type CategoryFeeMap = Partial<Record<AnyMemberCategory, CategoryFee>>;

/** 기본값: 유아유치 2종은 "안 받음"(0원), 나머지는 "받음" + 기본 단가 */
export function defaultCategoryFee(c: string, preRegFee: number): CategoryFee {
  if (c === "male_infant" || c === "female_infant") return { enabled: false, amount: 0 };
  return { enabled: true, amount: preRegFee };
}

/** DB jsonb → 안전한 맵 */
export function parseCategoryFees(raw: unknown): CategoryFeeMap {
  const out: CategoryFeeMap = {};
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (!ALL_MEMBER_CATEGORIES.includes(k as AnyMemberCategory)) continue;
      if (!v || typeof v !== "object") continue;
      const o = v as { enabled?: unknown; amount?: unknown };
      out[k as AnyMemberCategory] = {
        enabled: o.enabled !== false,
        amount: Math.max(0, Math.round(Number(o.amount) || 0)),
      };
    }
  }
  return out;
}

/** 해당 분류 1인 회비 */
export function feeForCategory(c: string, fees: CategoryFeeMap, preRegFee: number): number {
  const saved = fees[c as AnyMemberCategory];
  const cfg = saved ?? defaultCategoryFee(c, preRegFee);
  return cfg.enabled ? Math.max(0, cfg.amount) : 0;
}

/** 예상 회비 = Σ 각 참석자 분류의 설정 금액 */
export function sumCategoryFees(
  categories: string[],
  fees: CategoryFeeMap,
  preRegFee: number,
): number {
  return categories.reduce((sum, c) => sum + feeForCategory(c, fees, preRegFee), 0);
}
