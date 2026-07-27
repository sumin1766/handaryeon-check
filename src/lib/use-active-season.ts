import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Season = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
};

async function fetchSeasonsWithTimeout(ms = 10_000): Promise<Season[]> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  try {
    const { data, error } = await supabase
      .from("seasons")
      .select("*")
      .order("created_at", { ascending: false })
      .abortSignal(controller.signal);
    if (error) throw error;
    return (data ?? []) as Season[];
  } finally {
    clearTimeout(t);
  }
}

export function useSeasons() {
  const q = useQuery({
    queryKey: ["seasons"],
    queryFn: () => fetchSeasonsWithTimeout(10_000),
    // Season is the app's root context — refetch aggressively so a stalled
    // Data API doesn't leave the UI in a "시즌 없음" false state.
    refetchInterval: (query) => (query.state.error ? 5_000 : 30_000),
    refetchIntervalInBackground: false,
    retry: 8,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
  });

  useEffect(() => {
    const ch = supabase
      .channel(`seasons-rt-${Math.random()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "seasons" },
        () => q.refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return q;
}

export function useActiveSeason() {
  const { data: seasons, isLoading, isError, isSuccess, error, refetch } = useSeasons();
  const active = seasons?.find((s) => s.is_active) ?? seasons?.[0];
  const isEnded = !!(
    active?.end_date && new Date(active.end_date) < new Date(new Date().toDateString())
  );
  return {
    season: active,
    isLoading,
    isError,
    isSuccess,
    error,
    refetch,
    isEnded,
    all: seasons ?? [],
  };
}

/**
 * Global backend keepalive + auto-heal.
 *
 * Runs one lightweight query every ~25s to keep Lovable Cloud's Data API
 * warm (edge/pooler routes can otherwise go cold and time out on the next
 * user action). When a ping fails, it invalidates the seasons query so
 * every screen self-refreshes as soon as the backend recovers, instead of
 * getting stuck showing "시즌 없음" or a spinner.
 *
 * Returns the last observed connectivity status so the shell can surface
 * a "재연결 중" banner while the API is unreachable.
 */
export function useBackendKeepalive() {
  const qc = useQueryClient();
  const statusRef = useRef<{ ok: boolean; failures: number }>({ ok: true, failures: 0 });

  const q = useQuery({
    queryKey: ["backend-keepalive"],
    queryFn: async () => {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8_000);
      try {
        const { error } = await supabase
          .from("seasons")
          .select("id", { head: true, count: "exact" })
          .limit(1)
          .abortSignal(controller.signal);
        if (error) throw error;
        const wasDown = !statusRef.current.ok;
        statusRef.current = { ok: true, failures: 0 };
        // On recovery, kick every server-backed query so screens self-heal.
        if (wasDown) qc.invalidateQueries();
        return true;
      } catch (e) {
        statusRef.current = {
          ok: false,
          failures: statusRef.current.failures + 1,
        };
        throw e;
      } finally {
        clearTimeout(t);
      }
    },
    refetchInterval: (query) => (query.state.error ? 5_000 : 25_000),
    refetchIntervalInBackground: false,
    retry: 3,
    retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8_000),
    staleTime: 0,
  });

  // Also refetch immediately when the tab regains focus or network comes back.
  useEffect(() => {
    const onOnline = () => {
      qc.invalidateQueries();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") qc.invalidateQueries();
    };
    window.addEventListener("online", onOnline);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("online", onOnline);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [qc]);

  return {
    online: !q.isError,
    failing: q.isError,
    failures: statusRef.current.failures,
  };
}
