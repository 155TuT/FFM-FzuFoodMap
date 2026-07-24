import { useCallback, useMemo, useState } from "react";
import DOMPurify from "dompurify";
import { marked } from "marked";
import { FloatingDock } from "./components/layout/FloatingDock";
import { TopBar } from "./components/layout/TopBar";
import MapView, { type MapFocusRequest } from "./features/map/MapView";
import { useMapData } from "./features/map/useMapData";
import { useRegionSelection } from "./features/regions/useRegionSelection";
import { usePoiSearch } from "./features/search/usePoiSearch";
import { useTheme } from "./hooks/useTheme";
import type { GeoFeature, SearchField } from "./types";
import { getAppIconPaths } from "./utils/assetPaths";
import announcementText from "./assets/announcement.txt?raw";

type OpenOverlay = "search" | "info" | null;

export default function App() {
  const { city, activeRegionId } = useRegionSelection();
  const { theme, toggleTheme } = useTheme();
  const icons = useMemo(() => getAppIconPaths(theme), [theme]);
  const { data } = useMapData(city);
  const allFeatures = useMemo(() => data?.features ?? [], [data]);

  const [openOverlay, setOpenOverlay] = useState<OpenOverlay>(null);
  const [searchValue, setSearchValue] = useState("");
  const [activeQuery, setActiveQuery] = useState("");
  const [searchField, setSearchField] = useState<SearchField>("name");
  const [focusRequest, setFocusRequest] = useState<MapFocusRequest | null>(null);
  const [trackUserLocation, setTrackUserLocation] = useState(false);

  const suggestions = usePoiSearch(allFeatures, activeQuery, searchField);
  const visibleFeatures = activeQuery.trim() ? suggestions : allFeatures;
  const searchOpen = openOverlay === "search";
  const infoOpen = openOverlay === "info";

  const announcementHtml = useMemo(() => {
    const rawHtml = marked.parse(announcementText, { breaks: true });
    return DOMPurify.sanitize(typeof rawHtml === "string" ? rawHtml : "");
  }, []);

  const openSearch = useCallback(() => {
    setOpenOverlay("search");
    setActiveQuery(searchValue);
  }, [searchValue]);

  const closeSearch = useCallback(() => {
    setOpenOverlay(current => (current === "search" ? null : current));
    setActiveQuery("");
  }, []);

  const handleSearchValueChange = useCallback(
    (value: string) => {
      setSearchValue(value);
      if (searchOpen) setActiveQuery(value);
    },
    [searchOpen]
  );

  const handleSuggestionSelect = useCallback(
    (feature: GeoFeature) => {
      setFocusRequest(current => ({
        feature,
        field: searchField,
        query: activeQuery,
        requestId: (current?.requestId ?? 0) + 1
      }));
      closeSearch();
    },
    [activeQuery, closeSearch, searchField]
  );

  const toggleInfo = useCallback(() => {
    setOpenOverlay(current => (current === "info" ? null : "info"));
    setActiveQuery("");
  }, []);

  const toggleUserLocation = useCallback(() => {
    if (!("geolocation" in navigator)) {
      alert("当前浏览器不支持定位功能");
      return;
    }
    setTrackUserLocation(current => !current);
  }, []);

  const handleUserLocationError = useCallback((message: string) => {
    alert(message);
  }, []);

  return (
    <>
      <TopBar
        city={city}
        searchOpen={searchOpen}
        searchValue={searchValue}
        searchField={searchField}
        suggestions={suggestions}
        icons={icons}
        onSearchOpen={openSearch}
        onSearchClose={closeSearch}
        onSearchValueChange={handleSearchValueChange}
        onSearchFieldChange={setSearchField}
        onSuggestionSelect={handleSuggestionSelect}
      />

      <MapView
        city={city}
        activeRegionId={activeRegionId}
        data={data}
        visibleFeatures={visibleFeatures}
        fitVisibleFeatures={Boolean(activeQuery.trim())}
        focusRequest={focusRequest}
        theme={theme}
        trackUserLocation={trackUserLocation}
        onUserLocationChange={setTrackUserLocation}
        onUserLocationError={handleUserLocationError}
      />

      <FloatingDock
        infoOpen={infoOpen}
        announcementHtml={announcementHtml}
        theme={theme}
        trackingUserLocation={trackUserLocation}
        icons={icons}
        onInfoToggle={toggleInfo}
        onThemeToggle={toggleTheme}
        onUserLocationToggle={toggleUserLocation}
      />
    </>
  );
}
