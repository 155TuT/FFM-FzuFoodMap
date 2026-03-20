import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import type { CityConfig } from "../cities";
import type { GeoFeature, GeoJson, PoiProps, SearchField } from "../types";
import SourcesSection from "./SourcesSection";
import { getFavs, setFavs, toggleFav } from "../utils/favorites";
import { parseFavFromUrl } from "../utils/share";
import {
  applyBaiduMapTheme,
  createBMapPoint,
  getBaiduMapAk,
  getBaiduMapMissingAkMessage,
  loadBaiduMapApi,
  roundCoordinates,
  type BMapCustomOverlay,
  type BMapEvent,
  type BMapGLNamespace,
  type BMapMap,
  type BMapMarker,
  type BMapOverlay,
  type Coordinates,
  wgs84ToBd09
} from "../utils/baiduMap";

const SEARCH_LIMIT = 8;
const DOT = " · ";
const UNCLUSTERED_ZOOM = 15;
const MAX_ZOOM = 19;
const CLUSTER_GRID_SIZE = 48;
const BAIDU_ZOOM_OFFSET = -1;
const CATEGORY_STORE = "门店";
const CATEGORY_CANTEEN = "食堂";
const CATEGORY_STALL = "摊位";
const REGION_UNASSIGNED = "__unassigned__";

const CATEGORY_COLORS: Record<string, { light: string; dark: string }> = {
  [CATEGORY_STORE]: { light: "#0ea5e9", dark: "#7dd3fc" },
  [CATEGORY_CANTEEN]: { light: "#22c55e", dark: "#86efac" },
  [CATEGORY_STALL]: { light: "#8b5cf6", dark: "#c4b5fd" }
};
const DEFAULT_CATEGORY = CATEGORY_STORE;

const TEXT = {
  collect: "收藏",
  collected: "已收藏"
} as const;

type ThemeMode = "light" | "dark";

type Props = {
  city: CityConfig;
  activeRegionId: string | null;
  query: string;
  searchField: SearchField;
  onlyFav: boolean;
  onShare: (favIds: string[]) => void;
  onSuggestionsChange?: (suggestions: GeoFeature[]) => void;
  theme: ThemeMode;
  trackUserLocation: boolean;
  onUserLocationError?: (message: string) => void;
  onUserLocationChange?: (tracking: boolean) => void;
};

type ClusterResult = {
  center: Coordinates;
  features: GeoFeature[];
};

export default function MapView({
  city,
  activeRegionId,
  query,
  searchField,
  onlyFav,
  onShare,
  onSuggestionsChange,
  theme,
  trackUserLocation,
  onUserLocationError,
  onUserLocationChange
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<BMapMap | null>(null);
  const baiduMapApiRef = useRef<BMapGLNamespace | null>(null);
  const popupOverlayRef = useRef<BMapCustomOverlay | null>(null);
  const popupElementRef = useRef<HTMLDivElement | null>(null);
  const popupPoiIdRef = useRef<string | null>(null);
  const popupSourcesRootRef = useRef<Root | null>(null);
  const overlayRef = useRef<BMapOverlay[]>([]);

  const [rawData, setRawData] = useState<GeoJson | null>(null);
  const [favSet, setFavSet] = useState<Set<string>>(() => getFavs());
  const favSetRef = useRef(favSet);
  const rawDataRef = useRef<GeoJson | null>(null);
  const [suggestions, setSuggestions] = useState<GeoFeature[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [mapError, setMapError] = useState<string | null>(null);
  const [mapRevision, setMapRevision] = useState(0);
  const [mapResizeRevision, setMapResizeRevision] = useState(0);
  const userLocationWatchIdRef = useRef<number | null>(null);
  const userLocationMarkerRef = useRef<BMapMarker | null>(null);
  const userLocationCenteredRef = useRef(false);
  const userLocationActiveRef = useRef(false);
  const themeRef = useRef<ThemeMode>(theme);
  themeRef.current = theme;
  const citywideRegionId = useMemo(() => {
    const citywide = city.regions.find(region => region.isCitywide);
    return citywide?.id ?? city.defaultRegionId ?? city.regions[0]?.id ?? null;
  }, [city]);
  const activeRegionRef = useRef<string | null>(activeRegionId);
  activeRegionRef.current = activeRegionId;
  const citywideRegionRef = useRef<string | null>(citywideRegionId);
  citywideRegionRef.current = citywideRegionId;

  const baiduAk = useMemo(() => getBaiduMapAk(), []);

  const filteredFeatures = useMemo(() => {
    if (!rawData) return [];

    const trimmed = query.trim().toLowerCase();
    let nextFeatures = rawData.features.slice();

    if (trimmed) {
      nextFeatures = rawData.features
        .filter(feature => matchesSearch(feature, searchField, trimmed))
        .sort((a, b) => ratingValue(b) - ratingValue(a));
    }

    if (onlyFav) {
      nextFeatures = nextFeatures.filter(feature => favSet.has(feature.properties.id));
    }

    return nextFeatures;
  }, [favSet, onlyFav, query, rawData, searchField]);

  const cleanupPopupSourcesRoot = useCallback(() => {
    popupSourcesRootRef.current?.unmount();
    popupSourcesRootRef.current = null;
  }, []);

  const hidePoiPopup = useCallback(() => {
    cleanupPopupSourcesRoot();
    popupPoiIdRef.current = null;
    popupOverlayRef.current?.hide?.();
    if (popupElementRef.current) {
      popupElementRef.current.innerHTML = "";
      popupElementRef.current.style.display = "none";
    }
  }, [cleanupPopupSourcesRoot]);

  const stopUserLocationTracking = useCallback(
    (options?: { notify?: boolean }) => {
      const notify = options?.notify ?? true;
      const map = mapRef.current;

      if (userLocationWatchIdRef.current != null && typeof navigator !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(userLocationWatchIdRef.current);
        userLocationWatchIdRef.current = null;
      }

      if (userLocationMarkerRef.current && map) {
        map.removeOverlay(userLocationMarkerRef.current);
        userLocationMarkerRef.current = null;
      }

      userLocationCenteredRef.current = false;
      userLocationActiveRef.current = false;

      if (notify) {
        onUserLocationChange?.(false);
      }
    },
    [onUserLocationChange]
  );

  const fitToFeatures = useCallback((map: BMapMap, BMapGL: BMapGLNamespace, feats: GeoFeature[]) => {
    if (!feats.length) return;
    if (feats.length === 1) {
      focusPoint(
        map,
        BMapGL,
        feats[0].geometry.coordinates,
        Math.max(UNCLUSTERED_ZOOM, normalizeConfiguredZoom(city.zoom))
      );
      return;
    }
    map.setViewport(
      feats.map(feature => createBMapPoint(BMapGL, feature.geometry.coordinates)),
      { margins: [40, 40, 40, 40], noAnimation: false }
    );
  }, [city.zoom]);

  const showPoiPopup = useCallback(
    (poi: PoiProps, coordinates: Coordinates, options?: { highlightIncludeIndex?: number | null }) => {
      const BMapGL = baiduMapApiRef.current;
      const popupOverlay = popupOverlayRef.current;
      const popupElement = popupElementRef.current;
      if (!BMapGL || !popupOverlay || !popupElement) return;

      cleanupPopupSourcesRoot();
      popupPoiIdRef.current = poi.id;

      const tagText = Array.isArray(poi.tags) ? poi.tags.map(escapeHtml).join(DOT) : "";
      const priceText = poi.price ? escapeHtml(poi.price) : "";
      const tagPriceLine = [tagText, priceText].filter(Boolean).join(DOT);
      const addressLine = poi.address ? `${escapeHtml(poi.address)}` : "";
      const contactLine = poi.contact ? `${escapeHtml(poi.contact)}` : "";
      const openHourLine = poi.openhour ? `${escapeHtml(poi.openhour)}` : "";
      const scheduleLine = [openHourLine, contactLine].filter(Boolean).join(" ");
      const metaHtml = [
        scheduleLine ? `<div class="poi-meta">${scheduleLine}</div>` : "",
        addressLine ? `<div class="poi-meta">${addressLine}</div>` : "",
        tagPriceLine ? `<div class="poi-meta">${tagPriceLine}</div>` : ""
      ]
        .filter(Boolean)
        .join("");
      const includeEntries = getIncludeEntries(poi);
      const includeHtml =
        includeEntries.length > 0
          ? `<ul class="poi-include-list">${includeEntries
              .map(includeItem => {
                const nameHtml = `<div class="poi-include-name">${escapeHtml(includeItem.name)}</div>`;
                const noteHtml = includeItem.notes
                  ? `<div class="poi-include-notes">${escapeHtml(includeItem.notes)}</div>`
                  : "";
                return `<li class="poi-include-item">${nameHtml}${noteHtml}</li>`;
              })
              .join("")}</ul>`
          : "";
      const noteHtml =
        includeEntries.length === 0 && poi.notes ? `<div class="poi-notes">${escapeHtml(poi.notes)}</div>` : "";
      const highlightIncludeIndex = options?.highlightIncludeIndex ?? null;
      const isFavorite = favSetRef.current.has(poi.id);
      const favoriteLabel = getFavoriteLabel(isFavorite);
      const favoriteIconUrl = getFavoriteIconPath(themeRef.current, isFavorite);

      popupElement.innerHTML = `
        <div class="poi-popup-shell">
          <button
            class="fav-btn"
            data-id="${poi.id}"
            type="button"
            aria-pressed="${isFavorite ? "true" : "false"}"
            aria-label="${favoriteLabel}"
            title="${favoriteLabel}"
          >
            <img class="fav-btn__icon" src="${favoriteIconUrl}" alt="" aria-hidden="true" />
          </button>
          <div class="poi-card scrollable-card">
            <div class="poi-title">${escapeHtml(poi.name)}</div>
            ${metaHtml ? `<div class="poi-meta-group">${metaHtml}</div>` : ""}
            ${includeHtml}
            ${noteHtml}
          </div>
          <div class="poi-sources-slot"></div>
        </div>
      `;
      popupElement.style.display = "";
      popupOverlay.setPoint(createBMapPoint(BMapGL, coordinates));
      popupOverlay.show?.();

      queueMicrotask(() => {
        const card = popupElement.querySelector<HTMLDivElement>(".poi-card.scrollable-card");
        if (card) {
          card.scrollTop = 0;
          const includeItems = Array.from(card.querySelectorAll<HTMLLIElement>(".poi-include-item"));
          includeItems.forEach(item => item.classList.remove("poi-include-item--active"));
          if (
            highlightIncludeIndex != null &&
            highlightIncludeIndex >= 0 &&
            highlightIncludeIndex < includeItems.length
          ) {
            const targetItem = includeItems[highlightIncludeIndex];
            targetItem.classList.add("poi-include-item--active");
            card.scrollTop = Math.max(targetItem.offsetTop - 8, 0);
          }
        }

        const sourcesMount = popupElement.querySelector<HTMLDivElement>(".poi-sources-slot");
        if (sourcesMount) {
          const root = createRoot(sourcesMount);
          popupSourcesRootRef.current = root;
          root.render(<SourcesSection poi={poi} />);
        }

        const btn = popupElement.querySelector<HTMLButtonElement>(".fav-btn");
        if (!btn) return;
        btn.onclick = event => {
          event.preventDefault();
          event.stopPropagation();
          const id = btn.getAttribute("data-id");
          if (!id) return;
          const nextFavs = toggleFav(id);
          const updated = new Set(nextFavs);
          setFavSet(updated);
          favSetRef.current = updated;
          syncFavoriteButton(btn, updated.has(id), themeRef.current);
        };
      });
    },
    [cleanupPopupSourcesRoot]
  );

  const focusFeature = useCallback(
    (feature: GeoFeature, options?: { highlightIncludeIndex?: number | null }) => {
      const map = mapRef.current;
      const BMapGL = baiduMapApiRef.current;
      if (!map || !BMapGL) return;
      const coordinates = feature.geometry.coordinates;
      focusPoint(map, BMapGL, coordinates, Math.max(UNCLUSTERED_ZOOM, Math.round(map.getZoom())));
      showPoiPopup(feature.properties, coordinates, options);
    },
    [showPoiPopup]
  );

  const rebuildPoiOverlays = useCallback(() => {
    const map = mapRef.current;
    const BMapGL = baiduMapApiRef.current;
    if (!map || !BMapGL) return;

    overlayRef.current.forEach(overlay => map.removeOverlay(overlay));
    overlayRef.current = [];

    const highlightAll = !activeRegionRef.current || activeRegionRef.current === citywideRegionRef.current;
    const clusters = clusterFeatures(BMapGL, map, filteredFeatures);

    const nextOverlays = clusters.map(cluster => {
      if (cluster.features.length === 1) {
        const feature = cluster.features[0];
        const icon = createMarkerIcon(BMapGL, {
          size: 18,
          fill: getPoiFillColor(feature, themeRef.current, favSetRef.current, activeRegionRef.current, highlightAll),
          stroke: getPoiStrokeColor(themeRef.current)
        });

        const marker = new BMapGL.Marker(createBMapPoint(BMapGL, feature.geometry.coordinates), {
          icon,
          title: feature.properties.name
        });

        marker.addEventListener?.("click", () => {
          focusFeature(feature);
        });

        map.addOverlay(marker);
        return marker;
      }

      const activeCluster =
        highlightAll ||
        !activeRegionRef.current ||
        cluster.features.some(
          feature => (feature.properties.regionId ?? REGION_UNASSIGNED) === activeRegionRef.current
        );
      const icon = createClusterIcon(BMapGL, {
        count: cluster.features.length,
        fill: getClusterFillColor(themeRef.current, cluster.features.length, activeCluster),
        stroke: getPoiStrokeColor(themeRef.current),
        textColor: themeRef.current === "dark" ? "#e2e8f0" : "#0f172a"
      });

      const marker = new BMapGL.Marker(createBMapPoint(BMapGL, cluster.center), {
        icon,
        title: `共 ${cluster.features.length} 个点位`
      });

      marker.addEventListener?.("click", () => {
        const currentZoom = map.getZoom();
        if (currentZoom >= UNCLUSTERED_ZOOM - 1) {
          map.setViewport(
            cluster.features.map(feature => createBMapPoint(BMapGL, feature.geometry.coordinates)),
            { margins: [40, 40, 40, 40], noAnimation: false }
          );
          return;
        }
        focusPoint(map, BMapGL, cluster.center, Math.min(currentZoom + 2, UNCLUSTERED_ZOOM));
      });

      map.addOverlay(marker);
      return marker;
    });

    overlayRef.current = nextOverlays;

    if (popupPoiIdRef.current && !filteredFeatures.some(feature => feature.properties.id === popupPoiIdRef.current)) {
      hidePoiPopup();
    }
  }, [filteredFeatures, focusFeature, hidePoiPopup]);

  useEffect(() => {
    favSetRef.current = favSet;
  }, [favSet]);

  useEffect(() => {
    rawDataRef.current = rawData;
  }, [rawData]);

  useEffect(() => {
    const favFromUrl = parseFavFromUrl();
    if (favFromUrl.length) {
      setFavs(favFromUrl);
      const next = new Set(favFromUrl);
      setFavSet(next);
      favSetRef.current = next;
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    container.classList.add("baidu-map-surface");
    container.classList.toggle("baidu-map-surface--dark", theme === "dark");
  }, [theme]);

  useEffect(() => {
    if (!containerRef.current) return;

    setMapReady(false);
    setMapError(null);

    if (!baiduAk) {
      setMapError(getBaiduMapMissingAkMessage());
      return;
    }

    let cancelled = false;
    const eventCleanups: Array<() => void> = [];

    void loadBaiduMapApi(baiduAk)
      .then(BMapGL => {
        if (cancelled || !containerRef.current) return;

        baiduMapApiRef.current = BMapGL;
        const map = new BMapGL.Map(containerRef.current, {
          minZoom: 3,
          maxZoom: MAX_ZOOM,
          enableAutoResize: true,
          enableTilt: false,
          enableRotate: false,
          enableRotateGestures: false,
          enableTiltGestures: false,
          displayOptions: {
            poi: false,
            poiText: false,
            poiIcon: false,
            overlay: true,
            building: false,
            indoor: false
          }
        });

        map.centerAndZoom(createBMapPoint(BMapGL, city.center), normalizeConfiguredZoom(city.zoom));
        map.enableScrollWheelZoom();
        map.enableResizeOnCenter?.();
        map.setMaxZoom(MAX_ZOOM);
        map.setDisplayOptions({
          poi: false,
          poiText: false,
          poiIcon: false,
          overlay: true,
          building: false,
          indoor: false
        });
        applyBaiduMapTheme(map, themeRef.current);
        mapRef.current = map;

        const popupElement = document.createElement("div");
        popupElement.className = "baidu-map-popup";
        popupElement.style.display = "none";
        popupElement.addEventListener("click", event => event.stopPropagation());
        popupElement.addEventListener("mousedown", event => event.stopPropagation());
        popupElement.addEventListener("wheel", event => event.stopPropagation(), { passive: true });
        popupElement.addEventListener("mouseenter", () => map.disableScrollWheelZoom?.());
        popupElement.addEventListener("mouseleave", () => map.enableScrollWheelZoom());
        popupElementRef.current = popupElement;

        const popupOverlay = new BMapGL.CustomOverlay(() => popupElement, {
          point: createBMapPoint(BMapGL, city.center),
          anchors: [0.5, 1],
          offsetY: -10,
          visible: false,
          useTranslate: true
        });
        popupOverlayRef.current = popupOverlay;
        map.addOverlay(popupOverlay);
        popupOverlay.hide?.();

        const handleMapChange = () => {
          setMapRevision(previous => previous + 1);
        };

        const handleMapResize = () => {
          setMapRevision(previous => previous + 1);
          setMapResizeRevision(previous => previous + 1);
        };

        const handleMapClick = (event: BMapEvent) => {
          if (!event.overlay) {
            hidePoiPopup();
          }
        };

        const handleTilesLoaded = () => {
          if (!cancelled) {
            setMapReady(true);
          }
        };

        map.addEventListener("moveend", handleMapChange);
        map.addEventListener("zoomend", handleMapChange);
        map.addEventListener("resize", handleMapResize);
        map.addEventListener("click", handleMapClick);
        map.addEventListener("ontilesloaded", handleTilesLoaded);
        map.addEventListener("tilesloaded", handleTilesLoaded);

        eventCleanups.push(
          () => map.removeEventListener("moveend", handleMapChange),
          () => map.removeEventListener("zoomend", handleMapChange),
          () => map.removeEventListener("resize", handleMapResize),
          () => map.removeEventListener("click", handleMapClick),
          () => map.removeEventListener("ontilesloaded", handleTilesLoaded),
          () => map.removeEventListener("tilesloaded", handleTilesLoaded)
        );

        window.setTimeout(() => {
          if (!cancelled) {
            setMapReady(true);
          }
        }, 400);
      })
      .catch(error => {
        if (!cancelled) {
          setMapError(error instanceof Error ? error.message : "百度地图初始化失败");
        }
      });

    return () => {
      cancelled = true;
      eventCleanups.forEach(cleanup => cleanup());
      cleanupPopupSourcesRoot();
      stopUserLocationTracking({ notify: false });

      const map = mapRef.current;
      overlayRef.current.forEach(overlay => map?.removeOverlay(overlay));
      overlayRef.current = [];

      if (popupOverlayRef.current && map) {
        map.removeOverlay(popupOverlayRef.current);
      }

      popupOverlayRef.current = null;
      popupElementRef.current = null;
      popupPoiIdRef.current = null;
      mapRef.current?.destroy?.();
      mapRef.current = null;
      baiduMapApiRef.current = null;
      setMapReady(false);
    };
  }, [baiduAk, city.center, city.zoom, cleanupPopupSourcesRoot, hidePoiPopup, stopUserLocationTracking]);

  useEffect(() => {
    const map = mapRef.current;
    const BMapGL = baiduMapApiRef.current;
    if (!map || !BMapGL) return;

    map.centerAndZoom(createBMapPoint(BMapGL, city.center), normalizeConfiguredZoom(city.zoom));
    setMapRevision(previous => previous + 1);
  }, [city.center, city.zoom]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    applyBaiduMapTheme(map, theme);
    setMapRevision(previous => previous + 1);
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const baseUrl = window.location.origin + import.meta.env.BASE_URL;
        const datasetRegions = city.regions.filter(region => region.dataPath);
        const fetchTargets = datasetRegions.map(region => ({
          id: region.id,
          url: new URL(region.dataPath!, baseUrl).toString()
        }));

        const results = await Promise.all(
          fetchTargets.map(async target => {
            try {
              const res = await fetch(target.url);
              if (!res.ok) throw new Error(`加载 ${target.url} 失败 (${res.status})`);
              const json = (await res.json()) as GeoJson;
              return { target, data: json };
            } catch (error) {
              console.error(error);
              return null;
            }
          })
        );

        if (cancelled) return;

        const features: GeoFeature[] = [];
        results.forEach(result => {
          if (!result) return;
          result.data.features.forEach(feature => {
            const assignedRegion = feature.properties.regionId ?? result.target.id ?? REGION_UNASSIGNED;
            feature.properties.regionId = assignedRegion;
            features.push(feature);
          });
        });

        setRawData({ type: "FeatureCollection", features });
      } catch (error) {
        console.error(error);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [city]);

  useEffect(() => {
    rebuildPoiOverlays();
  }, [mapReady, mapRevision, rebuildPoiOverlays]);

  useEffect(() => {
    if ((query.trim() || onlyFav) && filteredFeatures.length && mapRef.current && baiduMapApiRef.current) {
      fitToFeatures(mapRef.current, baiduMapApiRef.current, filteredFeatures);
    }
  }, [filteredFeatures, fitToFeatures, onlyFav, query]);

  useEffect(() => {
    if (!mapReady) return;
    if (!(query.trim() || onlyFav)) return;
    if (!filteredFeatures.length || !mapRef.current || !baiduMapApiRef.current) return;

    fitToFeatures(mapRef.current, baiduMapApiRef.current, filteredFeatures);
  }, [filteredFeatures, fitToFeatures, mapReady, mapResizeRevision, onlyFav, query]);

  useEffect(() => {
    if (!rawData) {
      setSuggestions([]);
      return;
    }

    const trimmedOriginal = query.trim();
    if (!trimmedOriginal) {
      setSuggestions([]);
      return;
    }

    const termLower = trimmedOriginal.toLowerCase();
    let matches = rawData.features.filter(feature => matchesSearch(feature, searchField, termLower));

    if (onlyFav) {
      matches = matches.filter(feature => favSet.has(feature.properties.id));
    }

    matches.sort((a, b) => ratingValue(b) - ratingValue(a));
    setSuggestions(matches.slice(0, SEARCH_LIMIT));
  }, [favSet, onlyFav, query, rawData, searchField]);

  useEffect(() => {
    onSuggestionsChange?.(suggestions);
  }, [onSuggestionsChange, suggestions]);

  const handleSuggestionSelect = useCallback(
    (feature: GeoFeature) => {
      const termLower = query.trim().toLowerCase();
      const highlightIncludeIndex =
        termLower.length > 0 ? computeIncludeHighlightIndex(feature.properties, searchField, termLower) : null;
      const popupOptions = highlightIncludeIndex != null ? { highlightIncludeIndex } : undefined;
      focusFeature(feature, popupOptions);
    },
    [focusFeature, query, searchField]
  );

  useEffect(() => {
    const handler: EventListener = event => {
      const { detail } = event as CustomEvent<{ id?: string }>;
      const id = detail?.id;
      if (!id || !rawDataRef.current) return;
      const feature = rawDataRef.current.features.find(item => item.properties.id === id);
      if (!feature) return;
      handleSuggestionSelect(feature);
    };

    window.addEventListener("focus-poi", handler);
    return () => window.removeEventListener("focus-poi", handler);
  }, [handleSuggestionSelect]);

  useEffect(() => {
    const handler = () => onShare([...favSetRef.current]);
    window.addEventListener("request-share-url", handler);
    return () => window.removeEventListener("request-share-url", handler);
  }, [onShare]);

  useEffect(() => {
    const map = mapRef.current;
    const BMapGL = baiduMapApiRef.current;
    if (!map || !BMapGL) return;

    const targetRegion =
      city.regions.find(region => region.id === activeRegionId) ??
      city.regions.find(region => region.isCitywide) ??
      null;
    focusPoint(
      map,
      BMapGL,
      targetRegion?.center ?? city.center,
      normalizeConfiguredZoom(targetRegion?.zoom ?? city.zoom)
    );
  }, [activeRegionId, city]);

  useEffect(() => {
    if (!trackUserLocation) {
      stopUserLocationTracking();
      return;
    }

    const map = mapRef.current;
    const BMapGL = baiduMapApiRef.current;
    if (!mapReady || !map || !BMapGL) {
      return;
    }

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      onUserLocationError?.("当前浏览器不支持定位功能");
      stopUserLocationTracking();
      return;
    }

    try {
      const watchId = navigator.geolocation.watchPosition(
        position => {
          const coords = roundCoordinates(wgs84ToBd09(position.coords.longitude, position.coords.latitude));
          const point = createBMapPoint(BMapGL, coords);

          let marker = userLocationMarkerRef.current;
          if (!marker) {
            marker = new BMapGL.Marker(point, {
              icon: createUserLocationIcon(BMapGL, themeRef.current),
              title: "我的位置"
            });
            map.addOverlay(marker);
            userLocationMarkerRef.current = marker;
          } else {
            marker.setPosition(point);
          }

          if (!userLocationCenteredRef.current) {
            focusPoint(map, BMapGL, coords, Math.max(Math.round(map.getZoom()), UNCLUSTERED_ZOOM));
            userLocationCenteredRef.current = true;
          }

          if (!userLocationActiveRef.current) {
            userLocationActiveRef.current = true;
            onUserLocationChange?.(true);
          }
        },
        error => {
          const message = getGeolocationErrorMessage(error);
          onUserLocationError?.(message);
          stopUserLocationTracking();
        },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
      );

      userLocationWatchIdRef.current = watchId;
    } catch (error) {
      console.error(error);
      onUserLocationError?.("定位功能被浏览器阻止，无法显示当前位置");
      stopUserLocationTracking();
    }

    return () => {
      stopUserLocationTracking({ notify: false });
    };
  }, [mapReady, onUserLocationChange, onUserLocationError, stopUserLocationTracking, trackUserLocation]);

  useEffect(() => {
    const marker = userLocationMarkerRef.current;
    const BMapGL = baiduMapApiRef.current;
    if (!marker || !BMapGL) return;
    marker.setIcon(createUserLocationIcon(BMapGL, theme));
  }, [theme]);

  return (
    <>
      <div id="map" ref={containerRef} />
      {!mapReady && !mapError && (
        <div className="map-loading-overlay" aria-live="polite" aria-busy="true">
          <span className="map-loading-text">
            稍等，美味正在赶来
            <span className="map-loading-dots" aria-hidden="true">
              <span>·</span>
              <span>·</span>
              <span>·</span>
            </span>
          </span>
        </div>
      )}
      {mapError && (
        <div className="map-loading-overlay map-loading-overlay--error" aria-live="polite">
          <span className="map-loading-text">{mapError}</span>
        </div>
      )}
    </>
  );
}

function focusPoint(map: BMapMap, BMapGL: BMapGLNamespace, coordinates: Coordinates, zoom: number) {
  const point = createBMapPoint(BMapGL, coordinates);
  if (typeof map.flyTo === "function") {
    map.flyTo(point, Math.min(zoom, MAX_ZOOM));
    return;
  }
  map.centerAndZoom(point, Math.min(zoom, MAX_ZOOM));
}

function normalizeConfiguredZoom(zoom: number) {
  return Math.max(3, Math.min(MAX_ZOOM, zoom + BAIDU_ZOOM_OFFSET));
}

function clusterFeatures(BMapGL: BMapGLNamespace, map: BMapMap, features: GeoFeature[]): ClusterResult[] {
  if (!features.length) return [];
  if (map.getZoom() >= UNCLUSTERED_ZOOM) {
    return features.map(feature => ({ center: feature.geometry.coordinates, features: [feature] }));
  }

  const buckets = new Map<
    string,
    {
      features: GeoFeature[];
      lngTotal: number;
      latTotal: number;
    }
  >();

  for (const feature of features) {
    const point = createBMapPoint(BMapGL, feature.geometry.coordinates);
    const pixel = map.pointToPixel(point);
    const key = `${Math.floor(pixel.x / CLUSTER_GRID_SIZE)}:${Math.floor(pixel.y / CLUSTER_GRID_SIZE)}`;
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.features.push(feature);
      bucket.lngTotal += feature.geometry.coordinates[0];
      bucket.latTotal += feature.geometry.coordinates[1];
      continue;
    }

    buckets.set(key, {
      features: [feature],
      lngTotal: feature.geometry.coordinates[0],
      latTotal: feature.geometry.coordinates[1]
    });
  }

  return [...buckets.values()].map(bucket => ({
    center: [bucket.lngTotal / bucket.features.length, bucket.latTotal / bucket.features.length],
    features: bucket.features
  }));
}

function createSvgDataUrl(svg: string) {
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createMarkerIcon(
  BMapGL: BMapGLNamespace,
  options: { size: number; fill: string; stroke: string }
) {
  const { size, fill, stroke } = options;
  const radius = size / 2 - 3;
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="${fill}" stroke="${stroke}" stroke-width="3" />
    </svg>
  `;
  return new BMapGL.Icon(createSvgDataUrl(svg), new BMapGL.Size(size, size), {
    anchor: new BMapGL.Size(size / 2, size / 2)
  });
}

function createClusterIcon(
  BMapGL: BMapGLNamespace,
  options: { count: number; fill: string; stroke: string; textColor: string }
) {
  const size = getClusterSize(options.count);
  const radius = size / 2 - 3;
  const countText = options.count > 99 ? "99+" : String(options.count);
  const fontSize = options.count > 99 ? Math.max(11, size * 0.26) : Math.max(12, size * 0.3);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="${options.fill}" stroke="${options.stroke}" stroke-width="3" />
      <text
        x="50%"
        y="50%"
        dominant-baseline="middle"
        text-anchor="middle"
        font-size="${fontSize}"
        font-weight="700"
        fill="${options.textColor}"
        font-family="Inter, PingFang SC, Microsoft YaHei, sans-serif"
      >${countText}</text>
    </svg>
  `;

  return new BMapGL.Icon(createSvgDataUrl(svg), new BMapGL.Size(size, size), {
    anchor: new BMapGL.Size(size / 2, size / 2)
  });
}

function createUserLocationIcon(BMapGL: BMapGLNamespace, theme: ThemeMode) {
  const fill = theme === "dark" ? "#111928" : "#ffffff";
  const ring = "#0ea5e9";
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 22 22">
      <circle cx="11" cy="11" r="8" fill="${fill}" stroke="${ring}" stroke-width="4" />
      <circle cx="11" cy="11" r="2.5" fill="${ring}" />
    </svg>
  `;

  return new BMapGL.Icon(createSvgDataUrl(svg), new BMapGL.Size(22, 22), {
    anchor: new BMapGL.Size(11, 11)
  });
}

function getPoiFillColor(
  feature: GeoFeature,
  theme: ThemeMode,
  favSet: Set<string>,
  activeRegionId: string | null,
  highlightAll: boolean
) {
  if (favSet.has(feature.properties.id)) {
    return "#f59e0b";
  }

  const paletteKey = theme === "dark" ? "dark" : "light";
  const categoryColor = CATEGORY_COLORS[feature.properties.category ?? DEFAULT_CATEGORY]?.[paletteKey]
    ?? CATEGORY_COLORS[DEFAULT_CATEGORY][paletteKey];

  if (highlightAll || !activeRegionId) {
    return categoryColor;
  }

  const regionId = feature.properties.regionId ?? REGION_UNASSIGNED;
  return regionId === activeRegionId
    ? categoryColor
    : theme === "dark"
      ? "rgba(100, 116, 139, 0.45)"
      : "rgba(148, 163, 184, 0.55)";
}

function getPoiStrokeColor(theme: ThemeMode) {
  return theme === "dark" ? "rgba(148, 163, 184, 0.45)" : "rgba(255, 255, 255, 0.95)";
}

function getClusterFillColor(theme: ThemeMode, count: number, active: boolean) {
  if (!active) {
    return theme === "dark" ? "rgba(66, 70, 87, 0.7)" : "rgba(148, 163, 184, 0.55)";
  }

  if (theme === "dark") {
    if (count < 10) return "#8288a2";
    if (count < 30) return "#505676";
    if (count < 80) return "#424547";
    return "#27254b";
  }

  if (count < 10) return "#93c5fd";
  if (count < 30) return "#60a5fa";
  if (count < 80) return "#3b82f6";
  return "#1d4ed8";
}

function getClusterSize(count: number) {
  if (count < 10) return 28;
  if (count < 30) return 34;
  if (count < 80) return 40;
  return 46;
}

function getGeolocationErrorMessage(error: GeolocationPositionError) {
  switch (error.code) {
    case error.PERMISSION_DENIED:
      return "未获得定位授权，无法显示当前位置";
    case error.POSITION_UNAVAILABLE:
      return "无法获取有效的定位信息";
    case error.TIMEOUT:
      return "定位请求超时，请稍后重试";
    default:
      return "定位失败，请稍后重试";
  }
}

type IncludeEntry = { name: string; notes: string };

function getIncludeEntries(poi: PoiProps): IncludeEntry[] {
  const include = poi.include;
  if (!include) return [];

  const names = Array.isArray(include.name) ? include.name : [];
  const notes = Array.isArray(include.notes) ? include.notes : [];

  return names
    .map((rawName, index) => {
      const name = typeof rawName === "string" ? rawName.trim() : "";
      if (!name) return null;
      const rawNote = notes[index];
      const noteText = typeof rawNote === "string" ? rawNote.trim() : "";
      return { name, notes: noteText };
    })
    .filter((entry): entry is IncludeEntry => entry !== null);
}

function computeIncludeHighlightIndex(poi: PoiProps, field: SearchField, termLower: string): number | null {
  const entries = getIncludeEntries(poi);
  if (!entries.length || !termLower) return null;

  if (field === "name") {
    const nameIndex = entries.findIndex(entry => entry.name.toLowerCase().includes(termLower));
    if (nameIndex !== -1) {
      return nameIndex;
    }
  }

  if (field === "notes") {
    const noteIndex = entries.findIndex(entry => entry.notes.toLowerCase().includes(termLower));
    if (noteIndex !== -1) {
      return noteIndex;
    }
  }

  return null;
}

function matchesSearch(feature: GeoFeature, field: SearchField, termLower: string) {
  const { properties } = feature;
  if (field === "name") {
    if (properties.name.toLowerCase().includes(termLower)) {
      return true;
    }
    return getIncludeEntries(properties).some(entry => entry.name.toLowerCase().includes(termLower));
  }
  if (field === "tags") {
    return (properties.tags ?? []).some(tag => tag.toLowerCase().includes(termLower));
  }
  if (field === "notes") {
    if ((properties.notes ?? "").toLowerCase().includes(termLower)) {
      return true;
    }
    return getIncludeEntries(properties).some(entry => entry.notes.toLowerCase().includes(termLower));
  }
  return false;
}

function ratingValue(feature: GeoFeature) {
  return feature.properties.rating ?? -Infinity;
}

function getFavoriteLabel(isFavorite: boolean) {
  return isFavorite ? TEXT.collected : TEXT.collect;
}

function getFavoriteIconPath(theme: ThemeMode, isFavorite: boolean) {
  const base = (import.meta.env.BASE_URL ?? "/").replace(/\/?$/, "/");
  const themeDir = theme === "dark" ? "dark" : "light";
  const iconName = isFavorite ? "stared" : "star";
  return `${base}assets/icons/${themeDir}/${iconName}.svg`;
}

function syncFavoriteButton(button: HTMLButtonElement, isFavorite: boolean, theme: ThemeMode) {
  const label = getFavoriteLabel(isFavorite);
  button.setAttribute("aria-pressed", isFavorite ? "true" : "false");
  button.setAttribute("aria-label", label);
  button.title = label;

  const icon = button.querySelector<HTMLImageElement>(".fav-btn__icon");
  if (icon) {
    icon.src = getFavoriteIconPath(theme, isFavorite);
  }
}

function escapeHtml(text?: string) {
  return (text ?? "").replace(/[&<>"]/g, character => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
    return map[character] ?? character;
  });
}
