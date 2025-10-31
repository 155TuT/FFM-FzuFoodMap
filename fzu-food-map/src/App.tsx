import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import MapView from "./components/MapView";
import { CITIES, getCityBySlug } from "./cities";
import type { GeoFeature, SearchField } from "./types";
import { buildShareUrl, parseCityFromUrl } from "./utils/share";
import announcementText from "./assets/announcement.txt?raw";

type ThemeMode = "light" | "dark";

const TEXT = {
  shareCopied: "分享链接已复制到剪贴板",
  selectCity: "选择城市",
  searchPlaceholder: "搜索",
  toggleDark: "切换为深色模式",
  toggleLight: "切换为浅色模式",
  infoLabel: "页面公告",
  searchTitle: "搜索",
  brandTitle: "FFM | Fzu Food Map",
  chipGroup: "选择搜索类型",
  emptyPrompt: "输入关键字以搜索地点",
  emptyState: "暂无匹配结果"
} as const;

const SEARCH_OPTIONS: { value: SearchField; label: string }[] = [
  { value: "name", label: "店名" },
  { value: "tags", label: "标签" },
  { value: "notes", label: "菜品" }
];

const SYMBOL = {
  dot: " \u00b7 ",
  star: "\u2605"
} as const;

export default function App() {
  const urlCity = parseCityFromUrl();
  const [citySlug, setCitySlug] = useState(urlCity ?? CITIES[0].slug);
  const city = useMemo(() => getCityBySlug(citySlug), [citySlug]);

  const [searchTerm, setSearchTerm] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("name");
  const [searchOpen, setSearchOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const [suggestions, setSuggestions] = useState<GeoFeature[]>([]);
  const searchWrapperRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const popoverInputRef = useRef<HTMLInputElement | null>(null);

  const iconPaths = useMemo(() => {
    const suffix = theme === "dark" ? "_dark" : "";
    return {
      announcement: `/assets/icons/announcement${suffix}.svg`,
      favicon: `/assets/icons/favicon${suffix}.svg`,
      search: `/assets/icons/search${suffix}.svg`
    };
  }, [theme]);

  const announcementIconUrl = iconPaths.announcement;
  const faviconIconUrl = iconPaths.favicon;
  const searchIconUrl = iconPaths.search;

  const announcementHtml = useMemo(() => {
    const rawHtml = marked.parse(announcementText, { breaks: true });
    const html = typeof rawHtml === "string" ? rawHtml : "";
    return DOMPurify.sanitize(html);
  }, []);

  const [announcementIconError, setAnnouncementIconError] = useState(false);
  const [faviconError, setFaviconError] = useState(false);
  const [brandIconError, setBrandIconError] = useState(false);

  const onlyFav = false;

  const handleShare = useCallback(
    (favIds: string[]) => {
      const url = buildShareUrl(city.slug, favIds);
      navigator.clipboard.writeText(url).catch(() => undefined);
      alert(TEXT.shareCopied);
    },
    [city.slug]
  );

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === "light" ? "dark" : "light"));
  }, []);

  const openSearch = useCallback(() => {
    setInfoOpen(false);
    setSearchOpen(prev => (prev ? prev : true));
  }, []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
  }, []);

  const handleSuggestionClick = useCallback(
    (feature: GeoFeature) => {
      window.dispatchEvent(new CustomEvent("focus-poi", { detail: { id: feature.properties.id } }));
      closeSearch();
    },
    [closeSearch]
  );

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("city", citySlug);
    window.history.replaceState({}, "", url);
  }, [citySlug]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!searchOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSearch();
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (!searchWrapperRef.current?.contains(event.target as Node)) closeSearch();
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("mousedown", handleClickOutside);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("mousedown", handleClickOutside);
    };
  }, [closeSearch, searchOpen]);

  useEffect(() => {
    setFaviconError(false);
    const probe = new Image();
    probe.onload = () => setFaviconError(false);
    probe.onerror = () => setFaviconError(true);
    probe.src = faviconIconUrl;
    return () => {
      probe.onload = null;
      probe.onerror = null;
    };
  }, [faviconIconUrl]);

  useEffect(() => {
    setAnnouncementIconError(false);
    setBrandIconError(false);
  }, [theme]);

  useEffect(() => {
    if (!searchOpen) {
      searchInputRef.current?.blur();
      popoverInputRef.current?.blur();
      return;
    }

    const focusTarget = () => {
      if (typeof window !== "undefined" && window.matchMedia("(max-width: 719px)").matches) {
        popoverInputRef.current?.focus({ preventScroll: true });
      } else {
        searchInputRef.current?.focus({ preventScroll: true });
        searchInputRef.current?.select();
      }
    };

    requestAnimationFrame(focusTarget);
  }, [searchOpen]);

  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }

    link.href = faviconError
      ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='central' text-anchor='middle' font-size='42'%3E%F0%9F%8D%9C%3C/text%3E%3C/svg%3E"
      : faviconIconUrl;
  }, [faviconError, faviconIconUrl]);

  const showEmptyState = searchTerm.trim().length > 0 && suggestions.length === 0;

  return (
    <>
      <div className="toolbar">
        <button
          type="button"
          className="toolbar-brand"
          onClick={() => window.location.assign(window.location.pathname)}
          aria-label={TEXT.brandTitle}
        >
          <span className="toolbar-favicon" aria-hidden="true">
            {brandIconError ? (
              "🍜"
            ) : (
              <img
                src={faviconIconUrl}
                alt=""
                onLoad={() => setBrandIconError(false)}
                onError={() => setBrandIconError(true)}
              />
            )}
          </span>
          <span className="toolbar-title">{TEXT.brandTitle}</span>
        </button>

        <div
          className={`toolbar-search ${searchOpen ? "toolbar-search--open" : ""}`}
          ref={searchWrapperRef}
          onClick={() => {
            if (!searchOpen) {
              openSearch();
            } else {
              searchInputRef.current?.focus();
            }
          }}
        >
          <div className="toolbar-search-field">
            <span className="toolbar-search-icon" aria-hidden="true">
              <img src={searchIconUrl} alt="" />
            </span>
            <input
              type="search"
              className="toolbar-search-input"
              placeholder={TEXT.searchPlaceholder}
              value={searchTerm}
              ref={searchInputRef}
              onFocus={openSearch}
              onChange={event => setSearchTerm(event.target.value)}
              aria-haspopup="dialog"
              aria-expanded={searchOpen ? "true" : "false"}
              aria-controls="search-popover"
              readOnly={!searchOpen}
            />
          </div>

          {searchOpen && (
            <div id="search-popover" className="search-popover" role="dialog" aria-label={TEXT.searchTitle}>
              <div className="search-popover-input-row">
                <input
                  type="search"
                  value={searchTerm}
                  ref={popoverInputRef}
                  onChange={event => setSearchTerm(event.target.value)}
                  placeholder={TEXT.searchPlaceholder}
                  aria-label={TEXT.searchPlaceholder}
                />
              </div>
              <div className="search-popover-results" role="listbox" aria-label={TEXT.searchTitle}>
                {suggestions.length > 0 ? (
                  suggestions.map(feature => {
                    const props = feature.properties;
                    const tagText = Array.isArray(props.tags) ? props.tags.slice(0, 3).join(SYMBOL.dot) : "";
                    const priceText = props.price ?? "";
                    const ratingText = props.rating != null ? `${SYMBOL.star} ${props.rating}` : "";
                    const meta = [tagText, priceText, ratingText].filter(Boolean).join(SYMBOL.dot);

                    return (
                      <button
                        key={props.id}
                        type="button"
                        className="search-popover-result"
                        onClick={() => handleSuggestionClick(feature)}
                        role="option"
                      >
                        <span className="search-suggestion-title" title={props.name}>
                          {props.name}
                        </span>
                        {meta && <span className="search-suggestion-meta">{meta}</span>}
                      </button>
                    );
                  })
                ) : (
                  <p className="search-popover-empty">
                    {showEmptyState ? TEXT.emptyState : TEXT.emptyPrompt}
                  </p>
                )}
              </div>
              <div className="search-field-chips" role="group" aria-label={TEXT.chipGroup}>
                {SEARCH_OPTIONS.map(option => (
                  <button
                    key={option.value}
                    type="button"
                    className={`chip ${searchField === option.value ? "chip--active" : ""}`}
                    onClick={() => setSearchField(option.value)}
                    aria-pressed={searchField === option.value}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        <select
          id="city-select"
          name="city"
          aria-label={TEXT.selectCity}
          value={citySlug}
          onChange={event => setCitySlug(event.target.value)}
        >
          {CITIES.map(item => (
            <option key={item.slug} value={item.slug}>
              {item.name}
            </option>
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
            <span className="info-button-icon" aria-hidden="true">
              {announcementIconError ? (
                "!"
              ) : (
                <img
                  src={announcementIconUrl}
                  alt=""
                  onLoad={() => setAnnouncementIconError(false)}
                  onError={() => setAnnouncementIconError(true)}
                />
              )}
            </span>
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
        query={searchTerm}
        searchField={searchField}
        onlyFav={onlyFav}
        showSuggestions={!searchOpen}
        onShare={handleShare}
        onSuggestionsChange={setSuggestions}
        theme={theme}
      />

      <button
        type="button"
        className="theme-toggle"
        onClick={toggleTheme}
        aria-label={theme === "light" ? TEXT.toggleDark : TEXT.toggleLight}
      >
        <span aria-hidden="true">{theme === "light" ? "🌙" : "☀️"}</span>
      </button>
    </>
  );
}
