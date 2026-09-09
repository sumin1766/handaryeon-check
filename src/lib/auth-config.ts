import { useMutation } from "@tanstack/react-query";
import { verifyPasswordFn, changePasswordsFn } from "./auth.functions";

export type VerifiedRole = "admin" | "staff" | "user";

/** 서버 함수로 비밀번호를 검증한다 (시도 횟수 제한 포함). 역할 또는 null 반환. */
export async function verifyPassword(p: string): Promise<VerifiedRole | null> {
  return await verifyPasswordFn({ data: { password: p } });
}

/** Change all three passwords. Requires the current admin password. */
export function useChangePasswords() {
  return useMutation({
    mutationFn: async (input: {
      current_admin: string;
      new_admin: string;
      new_staff: string;
      new_user: string;
    }) => {
      await changePasswordsFn({ data: input });
    },
  });
}
