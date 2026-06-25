import { useSyncExternalStore } from "react";

export type AuthRole = "admin" | "user";
const KEY = "hdr_auth_role";
const EVT = "hdr-auth-role-changed";

function read(): AuthRole | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(KEY);
  return v === "admin" || v === "user" ? v : null;
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
  else window.localStorage.removeItem(KEY);
  window.dispatchEvent(new Event(EVT));
}
