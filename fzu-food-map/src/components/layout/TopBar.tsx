import { useEffect, useState } from "react";
import type { CityConfig } from "../../cities";
import type { GeoFeature, SearchField } from "../../types";
import type { AppIconPaths } from "../../utils/assetPaths";
import { SearchControl } from "../../features/search/components/SearchControl";
import "./TopBar.css";

type TopBarProps = {
  city: CityConfig;
  searchOpen: boolean;
  searchValue: string;
  searchField: SearchField;
  suggestions: GeoFeature[];
  icons: AppIconPaths;
  onSearchOpen: () => void;
  onSearchClose: () => void;
  onSearchValueChange: (value: string) => void;
  onSearchFieldChange: (field: SearchField) => void;
  onSuggestionSelect: (feature: GeoFeature) => void;
};

export function TopBar({
  city,
  searchOpen,
  searchValue,
  searchField,
  suggestions,
  icons,
  onSearchOpen,
  onSearchClose,
  onSearchValueChange,
  onSearchFieldChange,
  onSuggestionSelect
}: TopBarProps) {
  const [brandIconError, setBrandIconError] = useState(false);
  const [faviconError, setFaviconError] = useState(false);

  useEffect(() => {
    setBrandIconError(false);
    setFaviconError(false);

    const probe = new Image();
    probe.onload = () => setFaviconError(false);
    probe.onerror = () => setFaviconError(true);
    probe.src = icons.favicon;
    return () => {
      probe.onload = null;
      probe.onerror = null;
    };
  }, [icons.favicon]);

  useEffect(() => {
    let link = document.querySelector<HTMLLinkElement>("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.href = faviconError
      ? "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Ctext x='50%25' y='50%25' dominant-baseline='central' text-anchor='middle' font-size='42'%3E%F0%9F%8D%9C%3C/text%3E%3C/svg%3E"
      : icons.favicon;
  }, [faviconError, icons.favicon]);

  return (
    <header className="toolbar">
      <button
        type="button"
        className="toolbar-brand"
        onClick={() => window.location.assign(window.location.pathname)}
        aria-label="FFM | Fzu Food Map"
      >
        <span className="toolbar-favicon" aria-hidden="true">
          {brandIconError ? (
            "🍜"
          ) : (
            <img
              src={icons.favicon}
              alt=""
              onLoad={() => setBrandIconError(false)}
              onError={() => setBrandIconError(true)}
            />
          )}
        </span>
        <span className="toolbar-title">FFM | Fzu Food Map</span>
      </button>

      <SearchControl
        city={city}
        open={searchOpen}
        value={searchValue}
        field={searchField}
        suggestions={suggestions}
        icons={icons}
        onOpen={onSearchOpen}
        onClose={onSearchClose}
        onValueChange={onSearchValueChange}
        onFieldChange={onSearchFieldChange}
        onSuggestionSelect={onSuggestionSelect}
      />
    </header>
  );
}
