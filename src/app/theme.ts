// Colour scheme preference: follow the system (default) or force light/dark. Kept per device in localStorage;
// index.html applies it before the first paint so there is no flash of the wrong theme.
import { useEffect, useState } from "react";

export type ThemePref = "system" | "light" | "dark";
const KEY = "prep-theme";

function read(): ThemePref {
  try { const v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "system"; } catch { return "system"; }
}

function apply(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === "system") delete root.dataset.theme; else root.dataset.theme = pref;
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePref>(read);
  useEffect(() => {
    apply(pref);
    try { if (pref === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, pref); } catch { /* private mode: still applied for this visit */ }
  }, [pref]);
  return [pref, setPref] as const;
}
