import { useSyncExternalStore } from "react";
import type { QueryClient } from "@tanstack/react-query";
import { clearSessionPassword } from "./session-password";
import { clearQuerySessionCache } from "./query-session-cache";

export type AuthRole = "admin" | "staff" | "user";
const KEY = "hdr_auth_role";
const EVT = "hdr-auth-role-changed";

function read(): AuthRole | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  return v === "admin" || v === "staff" || v === "user" ? v : null;
}

const listeners = new Set<() => void>();
function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) cb();
  };
  const onEvt = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(EVT, onEvt);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(EVT, onEvt);
  };
}

export function useAuthRole(): AuthRole | null {
  return useSyncExternalStore(subscribe, read, () => null);
}

export function setAuthRole(role: AuthRole | null) {
  if (typeof window === "undefined") return;
  if (role) window.localStorage.setItem(KEY, role);
  else {
    window.localStorage.removeItem(KEY);
    clearSessionPassword();
    clearQuerySessionCache();
  }
  window.dispatchEvent(new Event(EVT));
}

export async function clearAuthSession(queryClient: QueryClient) {
  // Stop reads before clearing storage so an in-flight read cannot refill it.
  await queryClient.cancelQueries();
  queryClient.clear();
  setAuthRole(null);
}

export async function checkStoredSession(
  password: string | null,
  verify: (password: string) => Promise<AuthRole | null>,
): Promise<{ status: "ready"; role: AuthRole } | { status: "locked" } | { status: "error" }> {
  if (!password) return { status: "locked" };
  try {
    const role = await verify(password);
    return role ? { status: "ready", role } : { status: "locked" };
  } catch {
    return { status: "error" };
  }
}
