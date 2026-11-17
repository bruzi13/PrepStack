// Colour scheme preference: follow the system (default) or force light/dark. Kept per device in localStorage;
// index.html applies it before the first paint so there is no flash of the wrong theme.
import { useEffect, useState } from "react";

export type ThemePreference = "system" | "light" | "dark";
const STORAGE_KEY = "prep-theme";

function readStoredPreference(): ThemePreference {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" ? stored : "system";
  } catch {
    return "system";
  }
}

function applyToDocument(preference: ThemePreference) {
  const root = document.documentElement;
  if (preference === "system") delete root.dataset.theme; else root.dataset.theme = preference;
}

export function useTheme() {
  const [preference, setPreference] = useState<ThemePreference>(readStoredPreference);
  useEffect(() => {
    applyToDocument(preference);
    try {
      if (preference === "system") localStorage.removeItem(STORAGE_KEY); else localStorage.setItem(STORAGE_KEY, preference);
    } catch { /* private mode: still applied for this visit */ }
  }, [preference]);
  return [preference, setPreference] as const;
}
