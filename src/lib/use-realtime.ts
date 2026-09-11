import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const LOCAL_CHANGE_EVT = "handaryeon-data-changed";
const CROSS_TAB_CHANNEL = "handaryeon-data-changed";
const CROSS_TAB_STORAGE_KEY = "handaryeon:data-changed-at";

function getChannel(): BroadcastChannel | null {
  if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return null;
  const w = window as unknown as { __handaryeonChannel?: BroadcastChannel };
  if (!w.__handaryeonChannel) w.__handaryeonChannel = new BroadcastChannel(CROSS_TAB_CHANNEL);
  return w.__handaryeonChannel;
}

/**
 * 변경 액션(삭제/확정/재확정/납부 등) 직후 호출하면, 같은 탭뿐 아니라
 * 같은 브라우저의 다른 탭 화면도 다음 자동 주기를 기다리지 않고 즉시 재조회한다.
 */
export function notifyDataChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LOCAL_CHANGE_EVT));
  try {
    getChannel()?.postMessage(Date.now());
  } catch {
    // 채널 사용 불가 — 아래 storage 신호로 대체된다.
  }
  try {
    window.localStorage.setItem(CROSS_TAB_STORAGE_KEY, String(Date.now()));
  } catch {
    // 저장소가 막혀 있어도 30초 주기 갱신이 백업으로 동작한다.
  }
}

export function useRealtimeInvalidate(tables: string[], invalidateKeys: unknown[][]) {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 탭이 화면 뒤에 있을 때 도착한 변경 알림을 잊지 않고 기억해 둔다.
  const pendingRef = useRef(false);
  useEffect(() => {
    const ch = supabase.channel(`rt-${tables.join("-")}-${Math.random()}`);
    const flush = () => {
      pendingRef.current = false;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      for (const k of invalidateKeys) {
        // refetchType: "all" — 지금 화면에 없는 목록도 오래된 값으로 표시하고 즉시 갱신한다.
        qc.invalidateQueries({ queryKey: k, refetchType: "all" });
      }
    };
    const invalidateSoon = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        pendingRef.current = true; // 보류 — 화면으로 돌아오면 즉시 반영
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      // 짧은 디바운스 — 변경이 몰려도 마지막 신호까지 반드시 반영된다.
      timerRef.current = setTimeout(flush, 400);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible" && pendingRef.current) flush();
    };
    for (const t of tables) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        invalidateSoon();
      });
    }
    ch.subscribe();
    // 실시간 알림이 닿지 않는 경우(브라우저 정책·네트워크·권한)를 대비한 주기 갱신.
    // 화면이 앞에 있을 때만 동작하므로 배경 탭에서는 부하가 없다.
    const poll = setInterval(() => {
      if (typeof document === "undefined" || document.visibilityState === "visible") flush();
    }, 30_000);
    // 다른 탭에서 일어난 변경도 즉시 반영한다(브로드캐스트 + 저장소 신호).
    const channel = getChannel();
    const onCrossTab = () => invalidateSoon();
    if (channel) channel.addEventListener("message", onCrossTab);
    const onStorage = (e: StorageEvent) => {
      if (e.key === CROSS_TAB_STORAGE_KEY) invalidateSoon();
    };
    window.addEventListener("storage", onStorage);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener(LOCAL_CHANGE_EVT, flush);
    return () => {
      clearInterval(poll);
      if (timerRef.current) clearTimeout(timerRef.current);
      if (channel) channel.removeEventListener("message", onCrossTab);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(LOCAL_CHANGE_EVT, flush);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(","), JSON.stringify(invalidateKeys)]);
}
