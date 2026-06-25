import { useEffect, useState } from "react";

type Theme = "light" | "dark";
const KEY = "hdr_theme";
const listeners = new Set<(t: Theme) => void>();

function read(): Theme {
  if (typeof window === "undefined") return "light";
  const v = window.localStorage.getItem(KEY);
  return v === "dark" ? "dark" : "light";
}

function apply(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (t === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
}

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() => read());
  useEffect(() => {
    apply(theme);
    const fn = (t: Theme) => setThemeState(t);
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, [theme]);
  const setTheme = (t: Theme) => {
    if (typeof window !== "undefined") window.localStorage.setItem(KEY, t);
    apply(t);
    listeners.forEach((l) => l(t));
  };
  return [theme, setTheme];
}

export function initThemeScript() {
  // Inline-able script string for SSR
  return `(function(){try{var t=localStorage.getItem('${KEY}');if(t==='dark')document.documentElement.classList.add('dark');}catch(e){}})();`;
}
