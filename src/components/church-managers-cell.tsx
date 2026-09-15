// 교회 단위 화면(접수시트·접수 명단)에서 담당자 표시.
// - 전체관리자: 모든 담당자를 보고, 대표 담당자는 굵게(별표) 표시하며 지정/해제할 수 있다.
// - 접수담당자·일반사용자: 대표가 지정돼 있으면 대표 1명만, 없으면 모든 담당자를 본다.
// 어떤 경우에도 원본 제출 데이터(담당자·연락처)는 바뀌지 않는다. 표시 규칙일 뿐이다.
import { useMutation } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";
import { toast } from "sonner";

import { getSessionPassword } from "@/lib/session-password";
import { setPrimaryChurchManager } from "@/lib/church-managers.functions";
import { notifyDataChanged } from "@/lib/use-realtime";
import type { ChurchManagerInfo } from "@/lib/use-church-managers";

type Props = {
  churchId: string;
  info?: ChurchManagerInfo;
  /** 사전접수 연결이 없을 때 보여줄 기본 담당자 (churches.contact_name / phone) */
  fallbackName?: string | null;
  fallbackPhone?: string | null;
  isAdmin?: boolean;
  onChanged?: () => void;
};

export function ChurchManagersCell({
  churchId,
  info,
  fallbackName,
  fallbackPhone,
  isAdmin,
  onChanged,
}: Props) {
  const setPrimaryFn = useServerFn(setPrimaryChurchManager);
  const setPrimary = useMutation({
    mutationFn: async (preRegistrationId: string | null) => {
      const password = getSessionPassword();
      if (!password) throw new Error("세션이 만료되었습니다. 다시 로그인해 주세요.");
      return setPrimaryFn({ data: { password, churchId, preRegistrationId } });
    },
    onSuccess: () => {
      toast.success("대표 담당자를 저장했습니다.");
      onChanged?.();
      notifyDataChanged();
    },
    onError: (e: Error) => toast.error(e.message || "대표 담당자 저장에 실패했습니다."),
  });

  const managers = info?.managers ?? [];

  if (!managers.length) {
    return (
      <div className="text-xs">
        <div>{fallbackName || "-"}</div>
        <div className="text-muted-foreground">{fallbackPhone ?? ""}</div>
      </div>
    );
  }

  const primaryId = info?.primaryPreRegistrationId ?? null;
  const ordered = [...managers].sort(
    (a, b) => Number(b.preRegistrationId === primaryId) - Number(a.preRegistrationId === primaryId),
  );
  // 비관리자는 대표가 지정된 경우 대표 1명만 본다(미지정이면 전원).
  const shown =
    !isAdmin && primaryId ? ordered.filter((m) => m.preRegistrationId === primaryId) : ordered;

  return (
    <div className="space-y-0.5 text-xs">
      {shown.map((m) => {
        const isPrimary = m.preRegistrationId === primaryId;
        return (
          <div key={m.preRegistrationId} className="flex items-center gap-1">
            {isAdmin && (
              <button
                type="button"
                title={isPrimary ? "대표 지정 해제" : "대표 담당자로 지정"}
                disabled={setPrimary.isPending}
                onClick={() => setPrimary.mutate(isPrimary ? null : m.preRegistrationId)}
                className="shrink-0 text-muted-foreground hover:text-amber-500"
              >
                <Star className={`h-3.5 w-3.5 ${isPrimary ? "fill-amber-400 text-amber-500" : ""}`} />
              </button>
            )}
            <span className={isPrimary ? "font-semibold" : "text-muted-foreground"}>{m.name}</span>
            {m.phone && <span className="text-muted-foreground">· {m.phone}</span>}
          </div>
        );
      })}
    </div>
  );
}

/** "교회 - 담당자" 한 줄 표기에 쓸 대표 담당자 이름. */
export function primaryManagerName(
  info: ChurchManagerInfo | undefined,
  fallbackName?: string | null,
): string {
  return info?.primary?.name ?? fallbackName ?? "";
}
