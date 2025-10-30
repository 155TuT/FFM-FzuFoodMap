import { useCallback, useEffect, useMemo, useState } from "react";
import { CITIES, getCityBySlug } from "./cities";
import MapView from "./components/MapView.tsx";
import { buildShareUrl, parseCityFromUrl } from "./utils/share";
import announcementText from "./assets/announcement.txt?raw";
import DOMPurify from "dompurify";
import { marked } from "marked";

type ThemeMode = "light" | "dark";

const TEXT = {
  shareCopied: "\u5206\u4eab\u94fe\u63a5\u5df2\u590d\u5236\u5230\u526a\u8d34\u677f",
  selectCity: "\u9009\u62e9\u57ce\u5e02",
  searchPlaceholder: "\u641c\u7d22\u5e97\u540d/\u6807\u7b7e/\u5907\u6ce8",
  toggleDark: "\u5207\u6362\u4e3a\u6df1\u8272\u6a21\u5f0f",
  toggleLight: "\u5207\u6362\u4e3a\u6d45\u8272\u6a21\u5f0f",
  infoLabel: "\u9875\u9762\u516c\u544a",
  brandTitle: "FFM | Fzu Food Map"
} as const;

export default function App() {
  const urlCity = parseCityFromUrl();
  const [citySlug, setCitySlug] = useState(urlCity ?? CITIES[0].slug);
  const city = useMemo(() => getCityBySlug(citySlug), [citySlug]);

  const [query, setQuery] = useState("");
  const onlyFav = false;
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });
  const [infoOpen, setInfoOpen] = useState(false);
  const announcementHtml = useMemo(() => {
    const rawHtml = marked.parse(announcementText, { breaks: true });
    const html = typeof rawHtml === "string" ? rawHtml : "";
    return DOMPurify.sanitize(html);
  }, []);

  const handleShare = useCallback(
    (favIds: string[]) => {
      const url = buildShareUrl(city.slug, favIds);
      navigator.clipboard.writeText(url).catch(() => {});
      alert(TEXT.shareCopied);
    },
    [city.slug]
  );

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === "light" ? "dark" : "light"));
  }, []);

  useEffect(() => {
    const u = new URL(window.location.href);
    u.searchParams.set("city", citySlug);
    window.history.replaceState({}, "", u);
  }, [citySlug]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return (
    <>
      <div className="toolbar">
        <button
          type="button"
          className="toolbar-brand"
          onClick={() => window.location.assign(window.location.pathname)}
          aria-label={TEXT.brandTitle}
        >
          <span className="toolbar-favicon" aria-hidden="true">🍜</span>
          <span className="toolbar-title">{TEXT.brandTitle}</span>
        </button>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          type="search"
          placeholder={TEXT.searchPlaceholder}
        />
        <select
          id="city-select"
          name="city"
          aria-label={TEXT.selectCity}
          value={citySlug}
          onChange={e => setCitySlug(e.target.value)}
        >
          {CITIES.map(c => (
            <option key={c.slug} value={c.slug}>{c.name}</option>
          ))}
        </select>
        <div className="toolbar-info">
          <button
            type="button"
            className="info-button"
            aria-expanded={infoOpen ? "true" : "false"}
            aria-controls="toolbar-announcement"
            onClick={() => setInfoOpen(prev => !prev)}
            aria-label={TEXT.infoLabel}
          >
            <span aria-hidden="true">!</span>
          </button>
          {infoOpen && (
            <div
              id="toolbar-announcement"
              className="info-panel"
              role="region"
              aria-live="polite"
            >
              <div dangerouslySetInnerHTML={{ __html: announcementHtml }} />
            </div>
          )}
        </div>
      </div>

      <MapView
        city={city}
        query={query}
        onlyFav={onlyFav}
        theme={theme}
        onShare={handleShare}
      />

      <button
        type="button"
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label={theme === "light" ? TEXT.toggleDark : TEXT.toggleLight}
      >
        <span aria-hidden="true">{theme === "light" ? "\u{1f319}" : "\u2600\ufe0f"}</span>
      </button>
    </>
  );
}
