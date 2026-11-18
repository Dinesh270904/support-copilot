import { useCallback, useEffect, useLayoutEffect, useState } from "react";

export type Theme = "light" | "dark";
const KEY = "support-copilot.theme";

// localStorage can throw or be empty (private windows, blocked site data); the UI must work without it.
function readStored(): Theme | null {
  try {
    const value = window.localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return window.matchMedia?.("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

/** Theme follows the OS until the user picks one; the choice is then saved. The resolved theme is
 * always written to <html data-theme>, so CSS and tests have a single source of truth. */
export function useTheme() {
  const [chosen, setChosen] = useState<Theme | null>(readStored);
  const [system, setSystem] = useState<Theme>(systemTheme);

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-color-scheme: light)");
    if (!query) return;
    const onChange = () => setSystem(query.matches ? "light" : "dark");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  const theme = chosen ?? system;
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggle = useCallback(() => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setChosen(next);
    try {
      window.localStorage.setItem(KEY, next);
    } catch {
      /* keep the in-memory choice for this session */
    }
  }, [theme]);

  return { theme, toggle };
}
