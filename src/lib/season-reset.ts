// 현재 시즌 데이터/설정 초기화 항목 정의와 재확인 규칙 (순수 모듈).

export const RESET_ITEMS = [
  { key: "lodgings", label: "숙소", detail: "이 시즌의 숙소 목록 전체와 숙소 수동 정렬 설정 (배정된 참석자는 배정 해제)" },
  { key: "places", label: "장소", detail: "이 시즌의 장소 목록 전체" },
  { key: "bath_price", label: "목욕쿠폰 단가", detail: "목욕쿠폰 단가를 기본값(5,000원)으로" },
  { key: "bath_coupons", label: "목욕쿠폰 판매 내역", detail: "이 시즌의 목욕쿠폰 판매 기록 전체" },
  { key: "fee", label: "회비 설정", detail: "사전접수 회비·분류별 회비·세그 회비를 기본값으로" },
  { key: "nav_menu", label: "메뉴 순서·표시", detail: "메뉴(탭) 순서와 숨김 설정을 기본값으로" },
  { key: "dashboard_order", label: "대시보드 섹션 순서", detail: "대시보드 섹션 순서를 기본값으로" },
  { key: "apply_form", label: "사전접수 폼 관리", detail: "안내 문구, 사전접수 차단 토글·차단 문구를 기본값으로" },
  { key: "settings_card_order", label: "설정 카드 순서", detail: "설정 화면 카드 순서를 기본값으로" },
] as const;

export type ResetItemKey = (typeof RESET_ITEMS)[number]["key"] | "all";

export const RESET_ALL_DETAIL = [
  "교회 전체 (참석자·결제·체크인 기록 포함)",
  "사전접수 전체 (명단·변경 이력 포함)",
  "목욕쿠폰 판매 내역, 중복 확인·세그 합치기 기록",
  "숙소·장소 목록",
  "이 시즌의 모든 설정을 기본값으로",
];

/** 시즌 이름 재확인: 앞뒤 공백 없이 정확히 일치해야 한다. */
export function isSeasonNameConfirmed(typed: string, seasonName: string | null | undefined): boolean {
  return !!seasonName && typed === seasonName;
}

/** 실행 가능 여부: 부분 초기화는 시즌 이름, 전체 초기화는 시즌 이름 + 관리자 비밀번호 입력. */
export function canRunReset(opts: {
  item: ResetItemKey;
  typedName: string;
  seasonName: string | null | undefined;
  password?: string;
}): boolean {
  if (!isSeasonNameConfirmed(opts.typedName, opts.seasonName)) return false;
  if (opts.item === "all") return !!opts.password && opts.password.length > 0;
  return true;
}
