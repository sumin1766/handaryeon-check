import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getRegionStats } from "@/lib/region-stats.functions";
import { getSessionPassword } from "@/lib/session-password";
import { useActiveSeason } from "@/lib/use-active-season";
import { useAuthRole } from "@/lib/use-auth-role";
import { useRealtimeInvalidate } from "@/lib/use-realtime";

export function useRegionStats() {
  const { activeSeason, isViewingPast } = useActiveSeason();
  const role = useAuthRole();
  const read = useServerFn(getRegionStats);
  useRealtimeInvalidate(["churches", "pre_registrations", "seasons"], [["region-stats"]]);
  const query = useQuery({
    queryKey: ["region-stats", activeSeason?.id, role],
    enabled: !!role && !!activeSeason?.is_active && !isViewingPast,
    queryFn: async () => {
      const password = getSessionPassword();
      if (!password) throw new Error("다시 로그인해 주세요.");
      const result = await read({ data: { password } });
      if (result && result.seasonId !== activeSeason?.id) throw new Error("활성 시즌이 변경되었습니다. 다시 조회해 주세요.");
      return result;
    },
    staleTime: 15_000,
  });
  return { ...query, isViewingPast };
}