import type { ThemeMode } from "../theme";

export type AppIconPaths = ReturnType<typeof getAppIconPaths>;

export function getAppIconPaths(theme: ThemeMode) {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
  const themedIconDir = theme === "dark" ? "dark" : "light";
  const makePath = (file: string) => `${base}${file}`;

  return {
    announcement: makePath(`assets/icons/${themedIconDir}/announcement.svg`),
    favicon: makePath(`assets/icons/${themedIconDir}/favicon.svg`),
    locate: makePath(`assets/icons/${themedIconDir}/locate.svg`),
    search: makePath(`assets/icons/${themedIconDir}/search.svg`),
    themeToggle: makePath(`assets/icons/${themedIconDir}/to.svg`),
    clear: makePath("assets/icons/normal/delete.svg"),
    collapse: makePath("assets/icons/normal/liftup.svg")
  };
}
