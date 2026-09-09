// 공유 비밀번호 검증·변경 및 OCR 설정 — 서버 함수 전용 (방식 B).
// 데이터베이스 함수는 더 이상 브라우저에서 직접 호출하지 않는다.
// 로그인 검증은 IP 기준 시도 횟수 제한(5회 실패 시 10분 잠금)을 적용한다.
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

const MAX_FAILS = 5;
const LOCK_MS = 10 * 60 * 1000;

type Attempt = { fails: number; lockedUntil: number };
const attempts = new Map<string, Attempt>();

function clientIp(): string {
  const req = getRequest();
  return (
    req.headers.get("cf-connecting-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function checkLock(ip: string) {
  const a = attempts.get(ip);
  if (a && a.lockedUntil > Date.now()) {
    const mins = Math.max(1, Math.ceil((a.lockedUntil - Date.now()) / 60000));
    throw new Error(`로그인 시도가 너무 많습니다. ${mins}분 후 다시 시도해 주세요.`);
  }
}

function recordFail(ip: string) {
  const a = attempts.get(ip) ?? { fails: 0, lockedUntil: 0 };
  a.fails += 1;
  if (a.fails >= MAX_FAILS) {
    a.lockedUntil = Date.now() + LOCK_MS;
    a.fails = 0;
  }
  attempts.set(ip, a);
}

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** 공유 비밀번호 검증. 성공 시 역할, 실패 시 null. */
export const verifyPasswordFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1).max(200) }).parse(d))
  .handler(async ({ data }): Promise<"admin" | "staff" | "user" | null> => {
    const ip = clientIp();
    checkLock(ip);
    const db = await admin();
    const { data: role, error } = await db.rpc("verify_password", { p: data.password });
    if (error) throw new Error("확인에 실패했습니다.");
    if (role === "admin" || role === "staff" || role === "user") {
      attempts.delete(ip);
      return role;
    }
    recordFail(ip);
    return null;
  });

/** 세 비밀번호 일괄 변경 (현재 관리자 비밀번호 필요). */
export const changePasswordsFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        current_admin: z.string().min(1),
        new_admin: z.string().min(1),
        new_staff: z.string().min(1),
        new_user: z.string().min(1),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const ip = clientIp();
    checkLock(ip);
    const db = await admin();
    const { error } = await db.rpc("change_passwords", data as any);
    if (error) {
      recordFail(ip);
      throw new Error(error.message);
    }
    return { ok: true };
  });

export type OcrStatus = {
  has_key: boolean;
  key_last4: string | null;
  base_url: string;
  has_backup_key?: boolean;
  backup_key_last4?: string | null;
};

/** OCR 설정 상태 조회 (관리 화면 전용 — 공유 비밀번호 재확인). */
export const getOcrStatusFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ password: z.string().min(1) }).parse(d))
  .handler(async ({ data }): Promise<OcrStatus> => {
    const db = await admin();
    const { data: role } = await db.rpc("verify_password", { p: data.password });
    if (role !== "admin" && role !== "staff" && role !== "user") throw new Error("접근 권한이 없습니다.");
    const { data: status, error } = await db.rpc("ocr_status");
    if (error) throw new Error(error.message);
    return status as OcrStatus;
  });

export const updateOcrConfigFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        current_admin: z.string().min(1),
        new_api_key: z.string().nullable(),
        new_base_url: z.string().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const ip = clientIp();
    checkLock(ip);
    const db = await admin();
    const { error } = await db.rpc("ocr_config_update", data as any);
    if (error) {
      recordFail(ip);
      throw new Error(error.message);
    }
    return { ok: true };
  });

export const updateOcrBackupKeyFn = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ current_admin: z.string().min(1), new_key: z.string() }).parse(d),
  )
  .handler(async ({ data }): Promise<{ ok: true }> => {
    const ip = clientIp();
    checkLock(ip);
    const db = await admin();
    const { error } = await db.rpc("ocr_backup_key_update", data);
    if (error) {
      recordFail(ip);
      throw new Error(error.message);
    }
    return { ok: true };
  });
