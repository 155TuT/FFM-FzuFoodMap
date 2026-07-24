import { useEffect, useState } from "react";

export type ThemeMode = "light" | "dark";

const THEME_STORAGE_KEY = "ffm-studio-theme";
const lightFaviconSrc = new URL(
  "../../../fzu-food-map/public/assets/icons/light/ffmstudio.svg",
  import.meta.url
).href;
const darkFaviconSrc = new URL(
  "../../../fzu-food-map/public/assets/icons/dark/ffmstudio.svg",
  import.meta.url
).href;

function getInitialTheme(): ThemeMode {
  const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);
  if (savedTheme === "light" || savedTheme === "dark") {
    return savedTheme;
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export default function useStudioTheme() {
  const [theme, setTheme] = useState<ThemeMode>(() => getInitialTheme());

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    root.style.colorScheme = theme;
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);

    let favicon = document.querySelector<HTMLLinkElement>(
      'link[data-ffm-studio-favicon="true"]'
    );
    if (!favicon) {
      favicon = document.createElement("link");
      favicon.rel = "icon";
      favicon.type = "image/svg+xml";
      favicon.dataset.ffmStudioFavicon = "true";
      document.head.appendChild(favicon);
    }
    favicon.href = theme === "dark" ? darkFaviconSrc : lightFaviconSrc;

    let themeColor = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]'
    );
    if (!themeColor) {
      themeColor = document.createElement("meta");
      themeColor.name = "theme-color";
      document.head.appendChild(themeColor);
    }
    themeColor.content = theme === "dark" ? "#07111f" : "#f8fafc";
  }, [theme]);

  const toggleTheme = () => {
    setTheme(current => (current === "light" ? "dark" : "light"));
  };

  return { theme, toggleTheme };
}
