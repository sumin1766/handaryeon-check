import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type VerifiedRole = "admin" | "user";

/** Verify a password via SECURITY DEFINER RPC. Returns the role or null. */
export async function verifyPassword(p: string): Promise<VerifiedRole | null> {
  const { data, error } = await (supabase as any).rpc("verify_password", { p });
  if (error) throw error;
  if (data === "admin" || data === "user") return data;
  return null;
}

/** Change both passwords. Requires the current admin password. */
export function useChangePasswords() {
  return useMutation({
    mutationFn: async (input: {
      current_admin: string;
      new_admin: string;
      new_user: string;
    }) => {
      const { error } = await (supabase as any).rpc("change_passwords", {
        current_admin: input.current_admin,
        new_admin: input.new_admin,
        new_user: input.new_user,
      });
      if (error) throw error;
    },
  });
}
