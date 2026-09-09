// 사전접수(참석자 사전신청) 1단계 — 회비 설정 + 폼 안내 문구 상수.
// 회비 값은 시즌 스코프(app_settings.season_id)로 저장된다.
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { parseCategoryFees, type CategoryFeeMap } from "@/lib/member-categories";

export const DEFAULT_PRE_REG_FEE = 20000;
export const DEFAULT_SEGUE_MEMBER_FEE = 10000;

export type FeeConfig = {
  /** 사전접수 기본 단가 (분류별 설정이 없을 때의 기본값) */
  preRegFee: number;
  /** 세계로 성도 회비 (현장등록 전용 — 사전접수/확정 계산에는 미사용) */
  segueMemberFee: number;
  /** 세계로 성도 회비 받음 여부 */
  segueFeeEnabled: boolean;
  /** 분류별 회비 받음 여부 + 금액 */
  categoryFees: CategoryFeeMap;
};

/** 2단계 공개 폼 상단 안내 문구 (확정본). */
export const PRE_REG_FORM_NOTICES = {
  student:
    "학생은 성별과 관계없이 중등·고등·청년을 의미합니다. 단, 청년부라도 인솔(담당자·어린 학생 인솔 등) 목적으로 참석하는 경우 어른으로 등록할 수 있습니다.",
  phone:
    "전화번호는 유아유치(남아·여아)를 제외한 모든 참석자에게 필수입니다. (유아유치만 생략 가능)",

} as const;

export function useFeeConfig(seasonId?: string) {
  return useQuery({
    queryKey: ["fee-config", seasonId],
    enabled: !!seasonId,
    queryFn: async (): Promise<FeeConfig> => {
      const { data } = await supabase
        .from("app_settings")
        .select("*")
        .eq("season_id", seasonId!)
        .maybeSingle();
      return {
        preRegFee: (data as any)?.pre_reg_fee ?? DEFAULT_PRE_REG_FEE,
        segueMemberFee: (data as any)?.segue_member_fee ?? DEFAULT_SEGUE_MEMBER_FEE,
      };
    },
  });
}

export function useSaveFeeConfig(seasonId?: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (cfg: FeeConfig) => {
      if (!seasonId) throw new Error("활성 시즌이 없습니다");
      const { error } = await supabase.from("app_settings").upsert({
        season_id: seasonId,
        pre_reg_fee: cfg.preRegFee,
        segue_member_fee: cfg.segueMemberFee,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["fee-config"] });
      qc.invalidateQueries({ queryKey: ["app_settings"] });
    },
  });
}

/** 사전접수 예상 회비 = 인원수 × 일괄 회비 */
export function calcExpectedFee(headCount: number, preRegFee: number) {
  return Math.max(0, headCount) * preRegFee;
}
