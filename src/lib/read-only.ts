import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const READ_ONLY_MESSAGE =
  "과거 시즌은 조회 전용입니다. 수정하려면 현재 시즌으로 돌아오세요.";

let readOnly = false;

export function isReadOnlyMode() {
  return readOnly;
}

/** Central guard: call before running any write. Returns false when blocked. */
export function guardWrite(): boolean {
  if (!readOnly) return true;
  toast.error(READ_ONLY_MESSAGE);
  return false;
}

const WRITE_METHODS = ["insert", "update", "upsert", "delete"] as const;

let patched = false;

function patchClient() {
  if (patched) return;
  patched = true;
  const client = supabase as any;
  const originalFrom = client.from.bind(client);
  client.from = (table: string) => {
    const builder = originalFrom(table);
    if (!readOnly) return builder;
    for (const m of WRITE_METHODS) {
      (builder as any)[m] = () => {
        toast.error(READ_ONLY_MESSAGE);
        throw new Error(READ_ONLY_MESSAGE);
      };
    }
    return builder;
  };
  const originalRpc = client.rpc.bind(client);
  client.rpc = (fn: string, args?: any, opts?: any) => {
    if (readOnly && !fn.startsWith("verify_")) {
      toast.error(READ_ONLY_MESSAGE);
      throw new Error(READ_ONLY_MESSAGE);
    }
    return originalRpc(fn, args, opts);
  };
}

/** Enable/disable app-wide read-only mode (past / finished season browsing). */
export function setReadOnlyMode(next: boolean) {
  patchClient();
  readOnly = next;
}
