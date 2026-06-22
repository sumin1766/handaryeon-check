import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useRealtimeInvalidate(tables: string[], invalidateKeys: unknown[][]) {
  const qc = useQueryClient();
  useEffect(() => {
    const ch = supabase.channel(`rt-${tables.join("-")}-${Math.random()}`);
    for (const t of tables) {
      ch.on("postgres_changes", { event: "*", schema: "public", table: t }, () => {
        for (const k of invalidateKeys) qc.invalidateQueries({ queryKey: k });
      });
    }
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tables.join(","), JSON.stringify(invalidateKeys)]);
}
