import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";

export type Season = {
  id: string;
  name: string;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean;
};

export function useSeasons() {
  const q = useQuery({
    queryKey: ["seasons"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("seasons")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Season[];
    },
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
  const { data: seasons, isLoading } = useSeasons();
  const active = seasons?.find((s) => s.is_active) ?? seasons?.[0];
  const isEnded = !!(
    active?.end_date && new Date(active.end_date) < new Date(new Date().toDateString())
  );
  return { season: active, isLoading, isEnded, all: seasons ?? [] };
}
