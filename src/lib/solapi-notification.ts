export type NotificationStatus = "unsent" | "sending" | "sent" | "failed";
export type NotificationResult = {
  status: NotificationStatus;
  sent_at: string | null;
  message_id: string | null;
  failure_reason: string | null;
};
export type SolapiConfig = {
  apiKey: string; apiSecret: string; pfId: string; templateId: string; sender: string; fallbackSms: boolean;
};
export type NotificationRegistration = {
  status: string; manager_phone: string; church_name: string; manager_name: string; access_token: string;
};

export function notificationRoleAllowed(role: unknown) {
  return role === "admin" || role === "staff";
}

export function normalizeNotificationPhone(phone: string) {
  const digits = phone.replace(/[^0-9]/g, "");
  return /^010[0-9]{8}$/.test(digits) ? digits : null;
}

export function buildAlimtalkMessage(reg: NotificationRegistration, config: SolapiConfig, fallback = config.fallbackSms) {
  const to = normalizeNotificationPhone(reg.manager_phone);
  if (!to) throw new Error("담당자 연락처가 010으로 시작하는 11자리 번호가 아닙니다.");
  const url = `https://www.handaryeoncamp.space/apply/${reg.access_token}`;
  return {
    to,
    type: "ATA",
    ...(fallback ? {
      from: config.sender.replace(/[^0-9]/g, ""),
      text: `[2027 세계로 한다련 겨울캠프] 사전접수 확정 안내\n\n${reg.church_name} 사전접수가 확정되었습니다.\n담당자: ${reg.manager_name}\n\n아래 링크를 눌러 확인해 주세요.\n${url}\n\n1) 체크인용 QR 확인\n2) 등록 명단 조회·수정\n3) 캠프 현장에서 QR 제시 후 현장 체크인\n\n접수 담당자와 실제 참석자가 다를 경우 이 메시지를 반드시 전달해주세요!\n\n문의: 김승국 목사(010-9720-0880)`,
    } : {}),
    kakaoOptions: {
      pfId: config.pfId, templateId: config.templateId, disableSms: !fallback,
      variables: { "#{교회명}": reg.church_name, "#{담당자명}": reg.manager_name, "#{토큰}": reg.access_token },
    },
  };
}

/** Notification errors must never escape into the existing confirmation rollback. */
export async function notificationAfterConfirmation(send: () => Promise<NotificationResult>): Promise<NotificationResult> {
  try { return await send(); }
  catch { return { status: "failed", sent_at: null, message_id: null, failure_reason: "알림톡 처리 또는 발송 기록 저장에 실패했습니다. 확정은 완료되었습니다." }; }
}

export async function resendWithConfirmation(confirm: () => boolean, send: () => Promise<unknown>) {
  if (!confirm()) return false;
  await send();
  return true;
}

export function notificationLabel(result: NotificationResult | null | undefined) {
  if (result?.status === "sent") return "발송됨 (솔라피 접수)";
  if (result?.status === "sending") return "발송 중";
  if (result?.status === "failed") return `실패 · ${result.failure_reason ?? "발송 오류"}`;
  return `미발송${result?.failure_reason ? ` · ${result.failure_reason}` : ""}`;
}