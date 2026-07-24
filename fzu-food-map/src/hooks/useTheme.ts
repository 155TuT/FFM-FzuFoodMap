import { useCallback, useEffect, useState } from "react";
import type { ThemeMode } from "../theme";

function getInitialTheme(): ThemeMode {
  if (typeof window === "undefined") return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeMode>(getInitialTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(current => (current === "light" ? "dark" : "light"));
  }, []);

  return { theme, toggleTheme };
}
