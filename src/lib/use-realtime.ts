import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const LOCAL_CHANGE_EVT = "handaryeon-data-changed";

/**
 * 변경 액션(삭제/확정/재확정/납부 등) 직후 호출하면, 같은 탭의 모든 화면이
 * 다음 자동 주기를 기다리지 않고 즉시 재조회한다.
 */
export function notifyDataChanged() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(LOCAL_CHANGE_EVT));
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
        qc.invalidateQueries({ queryKey: k, refetchType: "active" });
      }
    };
    const invalidateSoon = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") {
        pendingRef.current = true; // 보류 — 화면으로 돌아오면 즉시 반영
        return;
      }
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(flush, 8_000);
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
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    window.addEventListener(LOCAL_CHANGE_EVT, flush);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
      window.removeEventListener(LOCAL_CHANGE_EVT, flush);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(","), JSON.stringify(invalidateKeys)]);
}
