import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import MapView from "./components/MapView";
import { CITIES, getCityBySlug, type CityConfig } from "./cities";
import type { GeoFeature, SearchField } from "./types";
import { buildShareUrl, parseCityFromUrl, parseRegionFromUrl } from "./utils/share";
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

const CITY_NAME_VISIBLE_CHARS = 3;
const REGION_NAME_VISIBLE_CHARS = 7;

function formatDisplayLabel(label: string, visibleChars: number) {
  const value = label ?? "";
  if (value.length <= visibleChars) return value;
  const sliceLength = Math.max(1, visibleChars - 1);
  return `${value.slice(0, sliceLength)}…`;
}

const formatCityLabel = (label: string) => formatDisplayLabel(label, CITY_NAME_VISIBLE_CHARS);
const formatRegionLabel = (label: string) => formatDisplayLabel(label, REGION_NAME_VISIBLE_CHARS);

const REGION_UNASSIGNED_ID = "__unassigned__";
const REGION_UNASSIGNED_LABEL = "未分区";

type SuggestionGroup = { regionId: string; label: string; items: GeoFeature[] };

type SearchInputProps = {
  variant: "toolbar" | "popover";
  value: string;
  placeholder: string;
  hasValue: boolean;
  searchIconUrl?: string;
  clearIconUrl: string;
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (value: string) => void;
  onClear: () => void;
  onFocus?: () => void;
  readOnly?: boolean;
};

type SelectionDropdownOption = {
  key: string;
  label: string;
  title: string;
  selected: boolean;
};

type SelectionDropdownProps = {
  open: boolean;
  title: string;
  ariaLabel: string;
  controlClassName: string;
  buttonLabelClassName: string;
  optionLabelClassName: string;
  dropdownClassName: string;
  triggerLabel: string;
  dropdownIconUrl: string;
  liftupIconUrl: string;
  options: SelectionDropdownOption[];
  onToggle: () => void;
  onSelect: (key: string) => void;
};

function SearchInput({
  variant,
  value,
  placeholder,
  hasValue,
  searchIconUrl,
  clearIconUrl,
  inputRef,
  onChange,
  onClear,
  onFocus,
  readOnly
}: SearchInputProps) {
  if (variant === "popover") {
    return (
      <div className="search-popover-input-row">
        <input
          type="search"
          value={value}
          ref={inputRef}
          onChange={event => onChange(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        {hasValue && (
          <button
            type="button"
            className="search-popover-clear"
            onClick={onClear}
          >
            <img src={clearIconUrl} alt="" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div className={`toolbar-search-field${hasValue ? " toolbar-search-field--has-text" : ""}`}>
      <span className="toolbar-search-icon" aria-hidden="true">
        <img src={searchIconUrl} alt="" />
      </span>
      <input
        type="search"
        className="toolbar-search-input"
        placeholder={placeholder}
        value={value}
        ref={inputRef}
        onFocus={onFocus}
        onChange={event => onChange(event.target.value)}
        aria-haspopup="dialog"
        aria-controls="search-popover"
        readOnly={readOnly}
      />
      {hasValue && (
        <button
          type="button"
          className="toolbar-search-clear"
          onClick={event => {
            event.stopPropagation();
            onClear();
          }}
        >
          <img src={clearIconUrl} alt="" />
        </button>
      )}
    </div>
  );
}

function SelectionDropdown({
  open,
  title,
  ariaLabel,
  controlClassName,
  buttonLabelClassName,
  optionLabelClassName,
  dropdownClassName,
  triggerLabel,
  dropdownIconUrl,
  liftupIconUrl,
  options,
  onToggle,
  onSelect
}: SelectionDropdownProps) {
  return (
    <div className={controlClassName}>
      <button
        type="button"
        className="location-panel-button"
        onClick={onToggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        title={title}
      >
        <span className={`location-panel-button-label ${buttonLabelClassName}`}>{triggerLabel}</span>
        <span className="location-panel-button-icon" aria-hidden="true">
          <img src={open ? liftupIconUrl : dropdownIconUrl} alt="" />
        </span>
      </button>
      {open && (
        <div className={`location-panel-dropdown ${dropdownClassName}`} role="listbox" aria-label={ariaLabel}>
          {options.map(option => (
            <button
              key={option.key}
              type="button"
              className={`location-panel-option${option.selected ? " location-panel-option--active" : ""}`}
              role="option"
              aria-selected={option.selected}
              onClick={() => onSelect(option.key)}
              title={option.title}
            >
              <span className={`location-panel-option-label ${optionLabelClassName}`}>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function resolveDefaultRegionId(city: CityConfig) {
  return (
    city.defaultRegionId ?? city.regions.find(region => region.isCitywide)?.id ?? city.regions[0]?.id ?? null
  );
}

export default function App() {
  const urlCity = parseCityFromUrl();
  const [citySlug, setCitySlug] = useState(urlCity ?? CITIES[0].slug);
  const city = useMemo(() => getCityBySlug(citySlug), [citySlug]);
  const [activeRegionId, setActiveRegionId] = useState<string | null>(() => {
    const regionFromUrl = parseRegionFromUrl();
    if (regionFromUrl && city.regions.some(region => region.id === regionFromUrl)) {
      return regionFromUrl;
    }
    return resolveDefaultRegionId(city);
  });

  const [searchTerm, setSearchTerm] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("name");
  const [searchOpen, setSearchOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [locationPanelOpen, setLocationPanelOpen] = useState(false);
  const [cityListOpen, setCityListOpen] = useState(false);
  const [regionListOpen, setRegionListOpen] = useState(false);
  const [theme, setTheme] = useState<ThemeMode>(() => {
    if (typeof window === "undefined") return "light";
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  });

  const [suggestions, setSuggestions] = useState<GeoFeature[]>([]);
  const regionNameMap = useMemo(() => {
    const map = new Map<string, string>();
    city.regions.forEach(region => map.set(region.id, region.name));
    return map;
  }, [city.regions]);
  const searchWrapperRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const popoverInputRef = useRef<HTMLInputElement | null>(null);
  const locationPanelRef = useRef<HTMLDivElement | null>(null);
  const locationButtonRef = useRef<HTMLButtonElement | null>(null);

  const iconPaths = useMemo(() => {
    const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
    const makePath = (file: string) => `${base}${file}`;
    const themedIconDir = theme === "dark" ? "dark" : "light";
    return {
      announcement: makePath(`assets/icons/${themedIconDir}/announcement.svg`),
      favicon: makePath(`assets/icons/${themedIconDir}/favicon.svg`),
      search: makePath(`assets/icons/${themedIconDir}/search.svg`),
      locate: makePath(`assets/icons/${themedIconDir}/locate.svg`),
      themeToggle: makePath(`assets/icons/${themedIconDir}/to.svg`),
      clear: makePath("assets/icons/normal/delete.svg"),
      collapse: makePath("assets/icons/normal/liftup.svg"),
      dropdown: makePath("assets/icons/normal/pulldown.svg")
    };
  }, [theme]);

  const announcementIconUrl = iconPaths.announcement;
  const faviconIconUrl = iconPaths.favicon;
  const searchIconUrl = iconPaths.search;
  const locateIconUrl = iconPaths.locate;
  const themeToggleIconUrl = iconPaths.themeToggle;
  const clearIconUrl = iconPaths.clear;
  const collapseIconUrl = iconPaths.collapse;
  const dropdownIconUrl = iconPaths.dropdown;
  const liftupIconUrl = iconPaths.collapse;

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
      const url = buildShareUrl(city.slug, activeRegionId, favIds);
      navigator.clipboard.writeText(url).catch(() => undefined);
      alert(TEXT.shareCopied);
    },
    [activeRegionId, city.slug]
  );

  const toggleTheme = useCallback(() => {
    setTheme(prev => (prev === "light" ? "dark" : "light"));
  }, []);

  const closeLocationPanel = useCallback(() => {
    setLocationPanelOpen(false);
    setCityListOpen(false);
    setRegionListOpen(false);
  }, []);

  const openSearch = useCallback(() => {
    setInfoOpen(false);
    closeLocationPanel();
    setSearchOpen(prev => {
      if (!prev) {
        setActiveQuery(searchTerm);
        return true;
      }
      return prev;
    });
  }, [closeLocationPanel, searchTerm]);

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

  const handleCitySelect = useCallback(
    (slug: string) => {
      setCitySlug(slug);
      setCityListOpen(false);
      setRegionListOpen(false);
    },
    []
  );

  const handleRegionSelect = useCallback(
    (regionId: string) => {
      setActiveRegionId(regionId);
      setRegionListOpen(false);
    },
    []
  );

  useEffect(() => {
    setActiveRegionId(prev => {
      if (prev && city.regions.some(region => region.id === prev)) {
        return prev;
      }
      const regionFromUrl = parseRegionFromUrl();
      if (regionFromUrl && city.regions.some(region => region.id === regionFromUrl)) {
        return regionFromUrl;
      }
      return resolveDefaultRegionId(city);
    });
  }, [city]);

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("city", citySlug);
    if (activeRegionId) {
      url.searchParams.set("region", activeRegionId);
    } else {
      url.searchParams.delete("region");
    }
    window.history.replaceState({}, "", url);
  }, [activeRegionId, citySlug]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    if (!locationPanelOpen) return;

    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (locationPanelRef.current?.contains(target) || locationButtonRef.current?.contains(target)) {
        return;
      }
      closeLocationPanel();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        closeLocationPanel();
        locationButtonRef.current?.focus();
      }
    };

    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeLocationPanel, locationPanelOpen]);

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
    if (!locationPanelOpen) {
      setCityListOpen(false);
      setRegionListOpen(false);
    }
  }, [locationPanelOpen]);

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
  const groupedSuggestions = useMemo(() => {
    if (!suggestions.length) return [];
    const grouped = new Map<string, GeoFeature[]>();
    suggestions.forEach(feature => {
      const regionId = feature.properties.regionId ?? REGION_UNASSIGNED_ID;
      const bucket = grouped.get(regionId);
      if (bucket) {
        bucket.push(feature);
      } else {
        grouped.set(regionId, [feature]);
      }
    });
    const ordered: SuggestionGroup[] = [];
    city.regions.forEach(region => {
      const items = grouped.get(region.id);
      if (items && items.length) {
        ordered.push({ regionId: region.id, label: region.name, items });
        grouped.delete(region.id);
      }
    });
    grouped.forEach((items, regionId) => {
      ordered.push({
        regionId,
        label: regionNameMap.get(regionId) ?? REGION_UNASSIGNED_LABEL,
        items
      });
    });
    return ordered;
  }, [city.regions, regionNameMap, suggestions]);

  const activeRegionLabel = useMemo(() => {
    if (activeRegionId) {
      return regionNameMap.get(activeRegionId) ?? REGION_UNASSIGNED_LABEL;
    }
    return (
      city.regions.find(region => region.isCitywide)?.name ??
      city.regions[0]?.name ??
      REGION_UNASSIGNED_LABEL
    );
  }, [activeRegionId, city.regions, regionNameMap]);

  const cityDisplayLabel = useMemo(() => formatCityLabel(city.name), [city.name]);
  const activeRegionDisplayLabel = useMemo(
    () => formatRegionLabel(activeRegionLabel),
    [activeRegionLabel]
  );
  const cityOptions = useMemo(
    () =>
      CITIES.map(item => ({
        key: item.slug,
        label: formatCityLabel(item.name),
        title: item.name,
        selected: item.slug === citySlug
      })),
    [citySlug]
  );
  const regionOptions = useMemo(
    () =>
      city.regions.map(region => ({
        key: region.id,
        label: formatRegionLabel(region.name),
        title: region.name,
        selected: region.id === activeRegionId
      })),
    [activeRegionId, city.regions]
  );

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
          <SearchInput
            variant="toolbar"
            value={searchTerm}
            placeholder={TEXT.searchPlaceholder}
            hasValue={hasSearchValue}
            searchIconUrl={searchIconUrl}
            clearIconUrl={clearIconUrl}
            inputRef={searchInputRef}
            onChange={handleSearchInputChange}
            onClear={clearSearch}
            onFocus={openSearch}
            readOnly={!searchOpen}
          />
          {/*
                aria-label="清除搜索内容"

          */}
          {searchOpen && (
            <div id="search-popover" className="search-popover" role="dialog" aria-label={TEXT.searchTitle}>
              <SearchInput
                variant="popover"
                value={searchTerm}
                placeholder={TEXT.searchPlaceholder}
                hasValue={hasSearchValue}
                clearIconUrl={clearIconUrl}
                inputRef={popoverInputRef}
                onChange={handleSearchInputChange}
                onClear={clearSearch}
              />
              {/*
                    aria-label="清除搜索内容"
              */}
              <div className="search-popover-results scrollable-card" role="listbox" aria-label={TEXT.searchTitle}>
                {suggestions.length > 0 ? (
                  groupedSuggestions.map(group => {
                    const headerId = `search-group-${group.regionId}`;
                    return (
                      <div
                        key={group.regionId}
                        className="search-popover-group"
                        role="group"
                        aria-labelledby={headerId}
                      >
                        <div className="search-popover-group-header" id={headerId}>
                          <span className="search-popover-group-label">{group.label}</span>
                          <span className="search-popover-group-divider" aria-hidden="true" />
                        </div>
                        {group.items.map(feature => {
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
                                  className={`search-suggestion-meta${
                                    item.secondary ? " search-suggestion-meta--secondary" : ""
                                  }`}
                                >
                                  {item.text}
                                </span>
                              ))}
                            </button>
                          );
                        })}
                      </div>
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

        <div className="toolbar-location">
          <button
            type="button"
            ref={locationButtonRef}
            className={`toolbar-location-trigger${locationPanelOpen ? " toolbar-location-trigger--open" : ""}`}
            aria-haspopup="dialog"
            aria-expanded={locationPanelOpen}
            aria-controls="location-panel"
            onClick={() => {
              if (locationPanelOpen) {
                closeLocationPanel();
                return;
              }
              setInfoOpen(false);
              if (searchOpen) {
                closeSearch();
              }
              setLocationPanelOpen(true);
              setCityListOpen(false);
              setRegionListOpen(false);
            }}
          >
            <span className="toolbar-location-label">切换区域</span>
            <span className="toolbar-location-icon" aria-hidden="true">
              <img
                src={locationPanelOpen ? liftupIconUrl : dropdownIconUrl}
                alt=""
              />
            </span>
          </button>
          {locationPanelOpen && (
            <div
              id="location-panel"
              ref={locationPanelRef}
              className="location-panel"
              role="dialog"
              aria-label="切换区域"
            >
              <div className="location-panel-expression">
                <SelectionDropdown
                  open={cityListOpen}
                  title={city.name}
                  ariaLabel={TEXT.selectCity}
                  controlClassName="location-panel-control location-panel-control--city"
                  buttonLabelClassName="location-panel-button-label--city"
                  optionLabelClassName="location-panel-option-label--city"
                  dropdownClassName="location-panel-dropdown--city"
                  triggerLabel={cityDisplayLabel}
                  dropdownIconUrl={dropdownIconUrl}
                  liftupIconUrl={liftupIconUrl}
                  options={cityOptions}
                  onToggle={() =>
                    setCityListOpen(prev => {
                      const next = !prev;
                      if (next) setRegionListOpen(false);
                      return next;
                    })
                  }
                  onSelect={handleCitySelect}
                />
                <span className="location-panel-suffix">市</span>
                <SelectionDropdown
                  open={regionListOpen}
                  title={activeRegionLabel}
                  ariaLabel="閫夋嫨鍖哄煙"
                  controlClassName="location-panel-control location-panel-control--region"
                  buttonLabelClassName="location-panel-button-label--region"
                  optionLabelClassName="location-panel-option-label--region"
                  dropdownClassName="location-panel-dropdown--region"
                  triggerLabel={activeRegionDisplayLabel}
                  dropdownIconUrl={dropdownIconUrl}
                  liftupIconUrl={liftupIconUrl}
                  options={regionOptions}
                  onToggle={() =>
                    setRegionListOpen(prev => {
                      const next = !prev;
                      if (next) setCityListOpen(false);
                      return next;
                    })
                  }
                  onSelect={handleRegionSelect}
                />
                {/*
                    <div className="location-panel-dropdown location-panel-dropdown--region" role="listbox" aria-label="閫夋嫨鍖哄煙">
                />
                    <div className="location-panel-dropdown location-panel-dropdown--region" role="listbox" aria-label="选择区域">
              </div>
              </div>
                */}
              </div>
            </div>
          )}
        </div>
      </div>

      <MapView
        city={city}
        activeRegionId={activeRegionId}
        query={activeQuery}
        searchField={searchField}
        onlyFav={onlyFav}
        onShare={handleShare}
        onSuggestionsChange={setSuggestions}
        theme={theme}
        trackUserLocation={trackUserLocation}
        onUserLocationChange={handleUserLocationChange}
        onUserLocationError={handleUserLocationError}
      />
      <div className="floating-dock" role="group" aria-label="界面功能">
        <div className="floating-actions">
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
            className={`floating-action-button floating-action-button--info${infoOpen ? " floating-action-button--active" : ""}`}
            aria-controls="toolbar-announcement"
            onClick={() => {
              setInfoOpen(prev => !prev);
              closeLocationPanel();
              if (searchOpen) {
                closeSearch();
              }
            }}
            aria-label={TEXT.infoLabel}
            title={TEXT.infoLabel}
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
    </>
  );
}
