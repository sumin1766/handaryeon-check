import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRealtimeInvalidate(tables: string[], invalidateKeys: unknown[][]) {
  const qc = useQueryClient();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const ch = supabase.channel(`rt-${tables.join("-")}-${Math.random()}`);
    const invalidateSoon = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        for (const k of invalidateKeys) {
          qc.invalidateQueries({ queryKey: k, refetchType: "active" });
        }
      }, 1_200);
    };
    for (const t of tables) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        invalidateSoon();
      });
    }
    ch.subscribe();
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(","), JSON.stringify(invalidateKeys)]);
}
