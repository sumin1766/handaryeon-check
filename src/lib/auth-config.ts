import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type AuthConfig = {
  id: number;
  admin_password: string;
  user_password: string;
  updated_at: string;
};

export const AUTH_CONFIG_QUERY_KEY = ["auth_config"] as const;

export function useAuthConfig() {
  return useQuery({
    queryKey: AUTH_CONFIG_QUERY_KEY,
    queryFn: async (): Promise<AuthConfig | null> => {
      const { data, error } = await (supabase as any)
        .from("auth_config")
        .select("*")
        .eq("id", 1)
        .maybeSingle();
      if (error) throw error;
      return data as AuthConfig | null;
    },
    staleTime: 30_000,
  });
}

export async function fetchAuthConfig(): Promise<AuthConfig | null> {
  const { data, error } = await (supabase as any)
    .from("auth_config")
    .select("*")
    .eq("id", 1)
    .maybeSingle();
  if (error) throw error;
  return data as AuthConfig | null;
}

export function useUpdateAuthConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { admin_password: string; user_password: string }) => {
      const admin = input.admin_password.trim();
      const user = input.user_password.trim();
      if (!admin || !user) throw new Error("비밀번호는 비워둘 수 없습니다.");
      if (admin === user) throw new Error("관리자와 일반 사용자 비밀번호가 같을 수 없습니다.");
      const { error } = await (supabase as any)
        .from("auth_config")
        .upsert({ id: 1, admin_password: admin, user_password: user, updated_at: new Date().toISOString() });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: AUTH_CONFIG_QUERY_KEY }),
  });
}
