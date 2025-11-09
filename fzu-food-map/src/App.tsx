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
  toggleDark: "深色模式",
  toggleLight: "浅色模式",
  infoLabel: "公告",
  searchTitle: "搜索",
  brandTitle: "FFM | Fzu Food Map",
  chipGroup: "选择搜索类型",
  emptyPrompt: "选择标签并输入关键字以搜索",
  emptyState: "暂无匹配结果，请尝试通过右侧公告反馈"
} as const;

const SEARCH_OPTIONS: { value: SearchField; label: string }[] = [
  { value: "name", label: "店名" },
  { value: "tags", label: "标签" },
  { value: "notes", label: "菜品" }
];

const SYMBOL = {
  dot: " · "
} as const;

export default function App() {
  const urlCity = parseCityFromUrl();
  const [citySlug, setCitySlug] = useState(urlCity ?? CITIES[0].slug);
  const city = useMemo(() => getCityBySlug(citySlug), [citySlug]);

  const [searchTerm, setSearchTerm] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
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
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
    const makePath = (file: string) => `${base}${file}`;
    const themeToggleFile = theme === "light" ? "assets/icons/to_dark.svg" : "assets/icons/to_light.svg";
    return {
      announcement: makePath(`assets/icons/announcement${suffix}.svg`),
      favicon: makePath(`assets/icons/favicon${suffix}.svg`),
      search: makePath(`assets/icons/search${suffix}.svg`),
      locate: makePath(`assets/icons/locate${suffix}.svg`),
      themeToggle: makePath(themeToggleFile),
      clear: makePath("assets/icons/delete.svg"),
      collapse: makePath("assets/icons/liftup.svg")
    };
  }, [theme]);

  const announcementIconUrl = iconPaths.announcement;
  const faviconIconUrl = iconPaths.favicon;
  const searchIconUrl = iconPaths.search;
  const locateIconUrl = iconPaths.locate;
  const themeToggleIconUrl = iconPaths.themeToggle;
  const clearIconUrl = iconPaths.clear;
  const collapseIconUrl = iconPaths.collapse;

  const announcementHtml = useMemo(() => {
    const rawHtml = marked.parse(announcementText, { breaks: true });
    const html = typeof rawHtml === "string" ? rawHtml : "";
    return DOMPurify.sanitize(html);
  }, []);

  const [announcementIconError, setAnnouncementIconError] = useState(false);
  const [faviconError, setFaviconError] = useState(false);
  const [brandIconError, setBrandIconError] = useState(false);
  const [locateIconError, setLocateIconError] = useState(false);
  const [themeToggleIconError, setThemeToggleIconError] = useState(false);

  const onlyFav = false;
  const [trackUserLocation, setTrackUserLocation] = useState(false);

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
    setSearchOpen(prev => {
      if (!prev) {
        setActiveQuery(searchTerm);
        return true;
      }
      return prev;
    });
  }, [searchTerm]);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setActiveQuery("");
  }, []);

  const toggleUserLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      alert("当前浏览器不支持定位功能");
      return;
    }
    setTrackUserLocation(prev => !prev);
  }, []);

  const handleUserLocationChange = useCallback((active: boolean) => {
    setTrackUserLocation(active);
  }, []);

  const handleUserLocationError = useCallback((message: string) => {
    alert(message);
  }, []);

  const handleSearchInputChange = useCallback(
    (value: string) => {
      setSearchTerm(value);
      if (searchOpen) {
        setActiveQuery(value);
      }
    },
    [searchOpen]
  );

  const clearSearch = useCallback(() => {
    setSearchTerm("");
    setActiveQuery("");
    requestAnimationFrame(() => {
      if (searchOpen) {
        (popoverInputRef.current ?? searchInputRef.current)?.focus();
      } else {
        searchInputRef.current?.focus();
      }
    });
  }, [searchOpen]);

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
      const target = event.target as Node;
      const mapElement = document.getElementById("map");
      if (mapElement?.contains(target)) {
        return;
      }
      if (!searchWrapperRef.current?.contains(target)) closeSearch();
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
    setLocateIconError(false);
    setThemeToggleIconError(false);
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
  const hasSearchValue = searchTerm.length > 0;

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
          <div className={`toolbar-search-field${hasSearchValue ? " toolbar-search-field--has-text" : ""}`}>
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
              onChange={event => handleSearchInputChange(event.target.value)}
              aria-haspopup="dialog"
              aria-controls="search-popover"
              readOnly={!searchOpen}
            />
            {hasSearchValue && (
              <button
                type="button"
                className="toolbar-search-clear"
                aria-label="清除搜索内容"
                onClick={event => {
                  event.stopPropagation();
                  clearSearch();
                }}
              >
                <img src={clearIconUrl} alt="" />
              </button>
            )}
          </div>

          {searchOpen && (
            <div id="search-popover" className="search-popover" role="dialog" aria-label={TEXT.searchTitle}>
              <div className="search-popover-input-row">
                <input
                  type="search"
                  value={searchTerm}
                  ref={popoverInputRef}
                  onChange={event => handleSearchInputChange(event.target.value)}
                  placeholder={TEXT.searchPlaceholder}
                  aria-label={TEXT.searchPlaceholder}
                />
                {hasSearchValue && (
                  <button
                    type="button"
                    className="search-popover-clear"
                    aria-label="清除搜索内容"
                    onClick={clearSearch}
                  >
                    <img src={clearIconUrl} alt="" />
                  </button>
                )}
              </div>
              <div className="search-popover-results scrollable-card" role="listbox" aria-label={TEXT.searchTitle}>
                {suggestions.length > 0 ? (
                  suggestions.map(feature => {
                    const props = feature.properties;
                    const tagText = Array.isArray(props.tags) ? props.tags.slice(0, 3).join(SYMBOL.dot) : "";
                    const priceText = props.price ?? "";
                    const addressText = props.address ? `${props.address}` : "";
                    const contactText = props.contact ? `tel:${props.contact}` : "";
                    const openHourText = props.openhour ? `${props.openhour}` : "";
                    const scheduleLine = [openHourText, contactText].filter(Boolean).join(" ");
                    const tagPriceLine = [tagText, priceText].filter(Boolean).join(SYMBOL.dot);
                    const noteLine = props.notes ? `${props.notes}` : "";
                    const lines = [
                      { key: "schedule", text: scheduleLine, secondary: false },
                      { key: "address", text: addressText, secondary: true },
                      { key: "tagprice", text: tagPriceLine, secondary: false },
                      { key: "note", text: noteLine, secondary: true }
                    ].filter(item => item.text);

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
                        {lines.map(item => (
                          <span
                            key={`${props.id}-popover-${item.key}`}
                            className={`search-suggestion-meta${item.secondary ? " search-suggestion-meta--secondary" : ""}`}
                          >
                            {item.text}
                          </span>
                        ))}
                      </button>
                    );
                  })
                ) : (
                  <p className="search-popover-empty">
                    {showEmptyState ? TEXT.emptyState : TEXT.emptyPrompt}
                  </p>
                )}
              </div>
              <div className="search-popover-footer">
                <div className="search-field-chips" role="group" aria-label={TEXT.chipGroup}>
                  {SEARCH_OPTIONS.map(option => (
                    <button
                      key={option.value}
                      type="button"
                      className={`chip ${searchField === option.value ? "chip--active" : ""}`}
                      onClick={() => setSearchField(option.value)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  className="search-popover-collapse"
                  onClick={event => {
                    event.preventDefault();
                    event.stopPropagation();
                    closeSearch();
                  }}
                  aria-label="收起搜索面板"
                >
                  <span className="search-popover-collapse-text">收起</span>
                  <span className="search-popover-collapse-icon" aria-hidden="true">
                    <img src={collapseIconUrl} alt="" />
                  </span>
                </button>
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
              <div
                className="info-panel-content scrollable-card"
                dangerouslySetInnerHTML={{ __html: announcementHtml }}
              />
            </div>
          )}
        </div>
      </div>

      <MapView
        city={city}
        query={activeQuery}
        searchField={searchField}
        onlyFav={onlyFav}
        showSuggestions={false}
        onShare={handleShare}
        onSuggestionsChange={setSuggestions}
        theme={theme}
        trackUserLocation={trackUserLocation}
        onUserLocationChange={handleUserLocationChange}
        onUserLocationError={handleUserLocationError}
      />
      <div className="floating-actions" role="group" aria-label="界面功能">
        <button
          type="button"
          className={`floating-action-button ${trackUserLocation ? "floating-action-button--active" : ""}`}
          onClick={toggleUserLocation}
          aria-label={trackUserLocation ? "停止定位" : "显示我的位置"}
          title={trackUserLocation ? "停止定位" : "显示我的位置"}
        >
          <span className="floating-action-icon" aria-hidden="true">
            {locateIconError ? (
              "📍"
            ) : (
              <img
                src={locateIconUrl}
                alt=""
                onLoad={() => setLocateIconError(false)}
                onError={() => setLocateIconError(true)}
              />
            )}
          </span>
        </button>
        <button
          type="button"
          className="floating-action-button theme-toggle"
          onClick={toggleTheme}
          aria-label={theme === "light" ? TEXT.toggleDark : TEXT.toggleLight}
          title={theme === "light" ? TEXT.toggleDark : TEXT.toggleLight}
        >
          <span className="floating-action-icon" aria-hidden="true">
            {themeToggleIconError ? (
              theme === "light" ? "🌙" : "☀️"
            ) : (
              <img
                src={themeToggleIconUrl}
                alt=""
                onLoad={() => setThemeToggleIconError(false)}
                onError={() => setThemeToggleIconError(true)}
              />
            )}
          </span>
        </button>
      </div>
    </>
  );
}
