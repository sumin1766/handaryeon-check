import { createServerOnlyFn } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { buildAlimtalkMessage, notificationRoleAllowed, type NotificationResult, type SolapiConfig } from "./solapi-notification";

// Read only inside a server-only boundary. No credential/config values are returned to the browser.
export const readSolapiConfig = createServerOnlyFn((): SolapiConfig => ({
  apiKey: process.env['SOLAPI_API_KEY']?.trim() ?? "",
  apiSecret: process.env['SOLAPI_API_SECRET']?.trim() ?? "",
  pfId: process.env['SOLAPI_PF_ID']?.trim() ?? "",
  templateId: process.env['SOLAPI_TEMPLATE_ID']?.trim() ?? "",
  sender: process.env['SOLAPI_SENDER']?.trim() ?? "",
  fallbackSms: process.env['SOLAPI_FALLBACK_SMS'] === "on",
}));

export async function authorizeNotification(password: string | undefined) {
  if (!password) { setResponseStatus(401); throw new Error("접근 권한이 없습니다."); }
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: role, error } = await supabaseAdmin.rpc("verify_password", { p: password });
  if (error || !notificationRoleAllowed(role)) { setResponseStatus(401); throw new Error("접근 권한이 없습니다."); }
  return supabaseAdmin;
}

export async function solapiAuthorization(config: SolapiConfig) {
  const date = new Date().toISOString();
  const salt = crypto.randomUUID().replace(/-/g, "");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(config.apiSecret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = Array.from(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(date + salt))))
    .map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return `HMAC-SHA256 apiKey=${config.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
}

type ProviderMessage = { messageId?: string; statusCode?: string };
type ProviderResponse = { failedMessageList?: ProviderMessage[]; messageList?: ProviderMessage[] };

// Latest official reference: https://solapi.com/developers/api/messages (2026-09-17).
// Exactly ONE message; showMessageList supplies its ID. Never expose/store the raw response.
export async function requestAlimtalk(reg: Parameters<typeof buildAlimtalkMessage>[0], config: SolapiConfig, fetcher: typeof fetch = fetch) {
  let fallback = config.fallbackSms;
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await fetcher("https://api.solapi.com/messages/v4/send-many/detail", {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(12000),
      headers: { "Content-Type": "application/json", Authorization: await solapiAuthorization(config) },
      body: JSON.stringify({ messages: [buildAlimtalkMessage(reg, config, fallback)], showMessageList: true, strict: true, allowDuplicates: false }),
    });
    const body = await response.json().catch(() => null) as ProviderResponse | null;
    const rejected = body?.failedMessageList?.[0];
    const accepted = body?.messageList?.find((message) => message.statusCode === "2000" && typeof message.messageId === "string");
    if (response.ok && accepted && !rejected) {
      return { status: "sent" as const, sent_at: new Date().toISOString(), message_id: accepted.messageId ?? null, failure_reason: null, fallback };
    }
    // A 403 (no accepted message), or documented 3040 unregistered sender, is explicit non-acceptance.
    // Never retry a timeout/5xx/ambiguous response: the original may already have been accepted.
    if (fallback && attempt === 0 && !accepted && (response.status === 403 || rejected?.statusCode === "3040")) {
      fallback = false;
      continue;
    }
    const reasons: Record<string, string> = {
      "3040": "솔라피에 등록된 발신번호가 아닙니다.",
      "3000": "솔라피 발송 요청 검증에 실패했습니다.",
    };
    return {
      status: "failed" as const, sent_at: null, message_id: rejected?.messageId ?? null,
      failure_reason: response.status === 401 ? "솔라피 인증에 실패했습니다." : response.status === 403 ? "솔라피 발송 권한 또는 허용 IP 설정을 확인해 주세요." :
        reasons[rejected?.statusCode ?? ""] ?? "솔라피가 발송을 접수하지 않았습니다. 템플릿·채널·잔액·수신번호를 확인해 주세요.",
      fallback,
    };
  }
  throw new Error("알림톡 발송에 실패했습니다.");
}

export async function sendRegistrationNotification(
  db: SupabaseClient<Database>, id: string, automatic: boolean, config: SolapiConfig,
  fetcher: typeof fetch = fetch,
): Promise<NotificationResult> {
  const { data: reg, error } = await db.from("pre_registrations")
    .select("status, access_token, manager_phone, church_name, manager_name, season_id").eq("id", id).maybeSingle();
  if (error || !reg) throw new Error("사전접수 건을 찾을 수 없습니다.");
  if (reg.status !== "applied" || !reg.access_token?.trim()) throw new Error("확정완료 및 접근 토큰이 있는 건만 발송할 수 있습니다.");
  const { data: season } = await db.from("seasons").select("is_active").eq("id", reg.season_id).maybeSingle();
  if (!season?.is_active) throw new Error("활성 시즌 건만 발송할 수 있습니다.");
  const lock = crypto.randomUUID();
  const { data: claimed, error: claimError } = await db.rpc("claim_pre_registration_notification", { p_id: id, p_automatic: automatic, p_lock: lock });
  if (claimError) throw new Error("발송 잠금 저장에 실패했습니다.");
  if (!claimed) {
    const { data: existing, error: readError } = await db.from("pre_registration_notifications")
      .select("status, sent_at, message_id, failure_reason").eq("pre_registration_id", id).maybeSingle();
    if (readError || !existing) throw new Error("발송 상태 조회에 실패했습니다.");
    return existing as NotificationResult;
  }
  let result: NotificationResult;
  let fallback = config.fallbackSms;
  if (!config.apiKey || !config.apiSecret || !config.pfId || !config.templateId || !config.sender) {
    result = { status: "unsent", sent_at: null, message_id: null, failure_reason: "솔라피 비밀값이 없거나 비어 있어 건너뛰었습니다." };
  } else {
    try {
      // Check/normalize stored number before any external request.
      buildAlimtalkMessage(reg, config);
      const response = await requestAlimtalk(reg, config, fetcher);
      result = response;
      fallback = response.fallback;
    } catch {
      result = { status: "failed", sent_at: null, message_id: null, failure_reason: "수신번호 오류 또는 솔라피 응답 오류입니다. 응답 지연 시 접수 여부를 확인한 뒤 재발송해 주세요." };
    }
  }
  const { data: finished, error: finishError } = await db.rpc("finish_pre_registration_notification", {
    p_id: id, p_lock: lock, p_automatic: automatic, p_status: result.status,
    p_message_id: result.message_id ?? "", p_reason: result.failure_reason ?? "", p_fallback: fallback,
  });
  // If persistence fails, keep the lock (no unsafe retry / duplicate send).
  if (finishError || !finished) throw new Error("발송 기록 저장에 실패했습니다. 솔라피 접수 여부 확인이 필요합니다.");
  return result;
}