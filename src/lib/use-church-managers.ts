// 교회별 담당자(연결된 사전접수 건) 목록을 화면에서 공유해 쓰기 위한 훅.
import { useQuery } from "@tanstack/react-query";
import { getSessionPassword } from "@/lib/session-password";
import {
  listChurchManagers,
  type ChurchManager,
  type ChurchManagerGroup,
} from "@/lib/church-managers.functions";

export type { ChurchManager, ChurchManagerGroup };

export type ChurchManagerInfo = {
  managers: ChurchManager[];
  primaryPreRegistrationId: string | null;
  /** 대표 표시 자리에 쓸 담당자 (지정 없으면 가장 먼저 접수한 담당자) */
  primary: ChurchManager | null;
};

export function useChurchManagers(seasonId: string | undefined) {
  const query = useQuery({
    queryKey: ["church-managers", seasonId],
    enabled: !!seasonId,
    queryFn: async () => {
      const password = getSessionPassword();
      if (!password) return [] as ChurchManagerGroup[];
      return listChurchManagers({ data: { password, seasonId: seasonId! } });
    },
  });

  const map = new Map<string, ChurchManagerInfo>();
  for (const g of query.data ?? []) {
    const primary =
      g.managers.find((m) => m.preRegistrationId === g.primaryPreRegistrationId) ??
      g.managers[0] ??
      null;
    map.set(g.churchId, {
      managers: g.managers,
      primaryPreRegistrationId: g.primaryPreRegistrationId,
      primary,
    });
  }

  return { map, refetch: query.refetch, isFetching: query.isFetching };
}
