// 확정 후 자가 수정으로 회비가 늘었을 때의 "추가 납부" 판정 (표시 전용, 저장값 없음).
// 마지막 확정 회비 = 현재 예상 회비 − 확정 이후 미해소 변경 이력(fee_delta)의 합.
// 확정 시 이력이 resolved 처리되므로, 미해소 이력의 합이 곧 확정 대비 차액이다.

export const SHOP_URL_CHURCH_LODGING = "https://www.handaryeon.com/shop_view?idx=15";
export const SHOP_URL_NO_CHURCH_LODGING = "https://www.handaryeon.com/shop_view?idx=16";

export type AdditionalPayment = { delta: number; total: number; shopUrl: string };

type MemberLike = { lodging_type: string; person_id?: string | null };

export function computeAdditionalPayment(input: {
  status: string;
  expectedFee: number;
  unresolvedFeeDeltas: number[];
  members: MemberLike[];
}): AdditionalPayment | null {
  if (input.status !== "needs_review") return null;
  const delta = input.unresolvedFeeDeltas.reduce((s, d) => s + (Number(d) || 0), 0);
  if (delta <= 0) return null;
  // 확정 때 운영 인원과 연결(person_id)되지 않은 줄 = 확정 이후 추가된 인원.
  const added = input.members.filter((m) => !m.person_id);
  const basis = added.length ? added : input.members;
  const shopUrl = basis.some((m) => m.lodging_type === "church")
    ? SHOP_URL_CHURCH_LODGING
    : SHOP_URL_NO_CHURCH_LODGING;
  return { delta, total: input.expectedFee, shopUrl };
}
