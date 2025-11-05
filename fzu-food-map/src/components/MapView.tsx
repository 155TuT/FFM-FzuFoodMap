import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type LngLatLike,
  type Map as MapLibreMap,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent,
  type ExpressionSpecification
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CityConfig } from "../cities";
import type { GeoFeature, GeoJson, PoiProps, SearchField } from "../types";
import { getFavs, setFavs, toggleFav } from "../utils/favorites";
import { parseFavFromUrl } from "../utils/share";

const SEARCH_LIMIT = 8;
const DOT = " \u00b7 ";
const UNCLUSTERED_ZOOM = 16;
const CATEGORY_STORE = "\u95e8\u5e97";
const CATEGORY_CANTEEN = "\u98df\u5802";
const CATEGORY_STALL = "\u644a\u4f4d";

const CATEGORY_COLORS: Record<string, { light: string; dark: string }> = {
  [CATEGORY_STORE]: { light: "#0ea5e9", dark: "#7dd3fc" },
  [CATEGORY_CANTEEN]: { light: "#22c55e", dark: "#86efac" },
  [CATEGORY_STALL]: { light: "#8b5cf6", dark: "#c4b5fd" }
};
const DEFAULT_CATEGORY = CATEGORY_STORE;

const TEXT = {
  details: "详情",
  collect: "收藏",
  collected: "已收藏",
  searchLabel: "搜索结果"
} as const;

type ThemeMode = "light" | "dark";

type Props = {
  city: CityConfig;
  query: string;
  searchField: SearchField;
  onlyFav: boolean;
  showSuggestions: boolean;
  onShare: (favIds: string[]) => void;
  onSuggestionsChange?: (suggestions: GeoFeature[]) => void;
  theme: ThemeMode;
  trackUserLocation: boolean;
  onUserLocationError?: (message: string) => void;
  onUserLocationChange?: (tracking: boolean) => void;
};

export default function MapView({
  city,
  query,
  searchField,
  onlyFav,
  showSuggestions,
  onShare,
  onSuggestionsChange,
  theme,
  trackUserLocation,
  onUserLocationError,
  onUserLocationChange
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const [rawData, setRawData] = useState<GeoJson | null>(null);
  const [favSet, setFavSet] = useState<Set<string>>(() => getFavs());
  const favSetRef = useRef(favSet);
  const rawDataRef = useRef<GeoJson | null>(null);
  const [suggestions, setSuggestions] = useState<GeoFeature[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const userLocationWatchIdRef = useRef<number | null>(null);
  const userLocationMarkerRef = useRef<maplibregl.Marker | null>(null);
  const userLocationCenteredRef = useRef(false);
  const userLocationActiveRef = useRef(false);
  const themeRef = useRef<ThemeMode>(theme);
  themeRef.current = theme;

  const stopUserLocationTracking = useCallback(
    (options?: { notify?: boolean }) => {
      const notify = options?.notify ?? true;

      if (userLocationWatchIdRef.current != null && typeof navigator !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(userLocationWatchIdRef.current);
        userLocationWatchIdRef.current = null;
      }

      if (userLocationMarkerRef.current) {
        userLocationMarkerRef.current.remove();
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

  const styleUrl = useMemo(() => {
    const key = import.meta.env.VITE_MAPTILER_KEY || "YOUR_KEY";
    const styleName = theme === "dark" ? "streets-v4-dark" : "streets-v4";
    return `https://api.maptiler.com/maps/${styleName}/style.json?key=${key}`;
  }, [theme]);

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
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(styleUrl);
  }, [styleUrl]);

  useEffect(() => {
    favSetRef.current = favSet;
  }, [favSet]);

  useEffect(() => {
    rawDataRef.current = rawData;
  }, [rawData]);

  const fitToFeatures = useCallback((map: MapLibreMap, feats: GeoFeature[]) => {
    const bounds = new maplibregl.LngLatBounds();
    feats.forEach(feature => bounds.extend(feature.geometry.coordinates as LngLatLike));
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 40, maxZoom: Math.min(UNCLUSTERED_ZOOM, map.getMaxZoom()) });
    }
  }, []);

  const rebuildPoiLayers = useCallback(
    (map: MapLibreMap, data: GeoJson) => {
      if (map.getLayer("clusters")) map.removeLayer("clusters");
      if (map.getLayer("cluster-count")) map.removeLayer("cluster-count");
      if (map.getLayer("unclustered")) map.removeLayer("unclustered");
      if (map.getSource("pois")) map.removeSource("pois");

      map.addSource("pois", {
        type: "geojson",
        data,
        cluster: true,
        clusterMaxZoom: UNCLUSTERED_ZOOM - 1,
        clusterRadius: 48
      });

      const clusterStyle = getClusterPaint(themeRef.current);
      const unclusteredStrokeColor = getCircleStrokeColor(themeRef.current);

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "pois",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": clusterStyle.circleColor,
          "circle-radius": [
            "step",
            ["get", "point_count"],
            14,
            10,
            18,
            30,
            22,
            80,
            28
          ],
          "circle-stroke-width": 1.3,
          "circle-stroke-color": clusterStyle.strokeColor
        }
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "pois",
        filter: ["has", "point_count"],
        layout: { "text-field": "{point_count_abbreviated}", "text-size": 12 },
        paint: { "text-color": clusterStyle.textColor }
      });

      map.addLayer({
        id: "unclustered",
        type: "circle",
        source: "pois",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": createCircleColorExpression(themeRef.current, favSetRef.current),
          "circle-radius": 6,
          "circle-stroke-width": 1.3,
          "circle-stroke-color": unclusteredStrokeColor
        }
      });

      fitToFeatures(map, data.features);
    },
    [fitToFeatures]
  );

  const showPoiPopup = useCallback(
    (poi: PoiProps, coordinates: LngLatLike, options?: { highlightIncludeIndex?: number | null }) => {
      const map = mapRef.current;
      if (!map) return;

      if (!popupRef.current) {
        popupRef.current = new maplibregl.Popup({ offset: 10, closeButton: false, maxWidth: "260px" });
      }

      const popup = popupRef.current;
      const tagText = Array.isArray(poi.tags) ? poi.tags.map(escapeHtml).join(DOT) : "";
      const priceText = poi.price ? escapeHtml(poi.price) : "";
      const tagPriceLine = [tagText, priceText].filter(Boolean).join(DOT);
      const addressLine = poi.address ? `${escapeHtml(poi.address)}` : "";
      const contactLine = poi.contact ? `${escapeHtml(poi.contact)}` : "";
      const openHourLine = poi.openhour ? `${escapeHtml(poi.openhour)}` : "";
      const scheduleLine = [openHourLine, contactLine].filter(Boolean).join(" ");
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
      const detailLinkHtml = poi.url
        ? `<a href="${poi.url}" target="_blank" rel="noopener noreferrer">${TEXT.details}</a>`
        : "";
      const highlightIncludeIndex = options?.highlightIncludeIndex ?? null;

      const html = `
        <div class="poi-card scrollable-card">
          <div class="poi-title">${escapeHtml(poi.name)}</div>
          ${scheduleLine ? `<div class="poi-meta">${scheduleLine}</div>` : ""}
          ${addressLine ? `<div class="poi-meta">${addressLine}</div>` : ""}
          ${tagPriceLine ? `<div class="poi-meta">${tagPriceLine}</div>` : ""}
          ${includeHtml}
          ${noteHtml}
          <div class="poi-actions">
            ${detailLinkHtml}
            <button class="fav-btn" data-id="${poi.id}" type="button">${
              favSetRef.current.has(poi.id) ? TEXT.collected : TEXT.collect
            }</button>
          </div>
        </div>
      `;

      popup.setLngLat(coordinates).setHTML(html).addTo(map);

      queueMicrotask(() => {
        const element = popup.getElement();
        if (!element) return;

        const card = element.querySelector<HTMLDivElement>(".poi-card.scrollable-card");
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
            const targetOffset = Math.max(targetItem.offsetTop - 8, 0);
            card.scrollTop = targetOffset;
          }
        }

        const btn = element.querySelector<HTMLButtonElement>(".fav-btn");
        if (!btn) return;
        btn.onclick = () => {
          const id = btn.getAttribute("data-id");
          if (!id) return;
          const nextFavs = toggleFav(id);
          const updated = new Set(nextFavs);
          setFavSet(updated);
          favSetRef.current = updated;
          btn.textContent = updated.has(id) ? TEXT.collected : TEXT.collect;
        };
      });
    },
    []
  );

  useEffect(() => {
    if (!containerRef.current) return;

    setMapReady(false);

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: city.center,
      zoom: city.zoom,
      maxZoom: 19
    });

    mapRef.current = map;

    const handleLoad = () => setMapReady(true);
    map.on("load", handleLoad);

    const typedMap = map as MapLibreMap & { setPrefetchZoomDelta?: (delta: number) => void };
    if (typeof typedMap.setPrefetchZoomDelta === "function") {
      typedMap.setPrefetchZoomDelta(0);
    }

    const handleClusterClick = (event: MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, { layers: ["clusters"] }) as MapGeoJSONFeature[];
      const clusterFeature = features[0];
      const clusterId = clusterFeature?.properties?.cluster_id;
      if (typeof clusterId !== "number") return;

      const source = map.getSource("pois");
      if (!source) return;
      const geoSource = source as GeoJSONSource;

      void geoSource
        .getClusterExpansionZoom(clusterId)
        .then(zoom => {
          if (zoom === undefined) return;
          const geometry = clusterFeature.geometry;
          if (!geometry || geometry.type !== "Point") return;
          map.easeTo({ center: geometry.coordinates as LngLatLike, zoom: Math.min(zoom, map.getMaxZoom()) });
        })
        .catch(() => undefined);
    };

    const handlePoiClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry?.type !== "Point") return;
      const coordinates = feature.geometry.coordinates as LngLatLike;
      const targetZoom = Math.min(Math.max(map.getZoom(), UNCLUSTERED_ZOOM), map.getMaxZoom());

      const props = feature.properties as { id?: unknown } | undefined;
      let poiForPopup: PoiProps | undefined;
      if (props && typeof props.id === "string") {
        poiForPopup = rawDataRef.current?.features.find(item => item.properties.id === props.id)?.properties;
      }
      if (!poiForPopup && props) {
        poiForPopup = props as PoiProps;
      }
      if (!poiForPopup) return;

      map.easeTo({ center: coordinates, zoom: targetZoom });
      showPoiPopup(poiForPopup, coordinates);
    };

    map.on("click", "clusters", handleClusterClick);
    map.on("click", "unclustered", handlePoiClick);
    map.on("mouseenter", "clusters", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseenter", "unclustered", () => {
      map.getCanvas().style.cursor = "pointer";
    });
    map.on("mouseleave", "clusters", () => {
      map.getCanvas().style.cursor = "";
    });
    map.on("mouseleave", "unclustered", () => {
      map.getCanvas().style.cursor = "";
    });

    return () => {
      map.off("load", handleLoad);
      map.off("click", "clusters", handleClusterClick);
      map.off("click", "unclustered", handlePoiClick);
      stopUserLocationTracking({ notify: false });
      map.remove();
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current = null;
      setMapReady(false);
    };
  }, [city.center, city.zoom, showPoiPopup, styleUrl, stopUserLocationTracking]);

  useEffect(() => {
    if (!trackUserLocation) {
      stopUserLocationTracking();
      return;
    }

    if (!mapReady || !mapRef.current) {
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
          const { latitude, longitude } = position.coords;
          const coords: LngLatLike = [longitude, latitude];
          const map = mapRef.current;
          if (!map) return;

          let marker = userLocationMarkerRef.current;
          if (!marker) {
            marker = new maplibregl.Marker({ element: createUserLocationMarker(themeRef.current) })
              .setLngLat(coords)
              .addTo(map);
            userLocationMarkerRef.current = marker;
          } else {
            marker.setLngLat(coords);
          }

          if (!userLocationCenteredRef.current) {
            const targetZoom = Math.min(Math.max(map.getZoom(), UNCLUSTERED_ZOOM), map.getMaxZoom());
            map.easeTo({ center: coords, zoom: targetZoom, duration: 600 });
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
      onUserLocationError?.("定位功能被浏览器阻止，无法显示当前位置");
      stopUserLocationTracking();
    }

    return () => {
      stopUserLocationTracking({ notify: false });
    };
  }, [
    trackUserLocation,
    mapReady,
    onUserLocationChange,
    onUserLocationError,
    stopUserLocationTracking
  ]);

  useEffect(() => {
    const marker = userLocationMarkerRef.current;
    if (marker) {
      const element = marker.getElement();
      element.className = `user-location-marker user-location-marker--${theme}`;
    }
  }, [theme]);

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const baseUrl = window.location.origin + import.meta.env.BASE_URL;
        const dataUrl = new URL(city.dataPath, baseUrl).toString();
        const res = await fetch(dataUrl);
        if (!res.ok) throw new Error(`加载 ${city.dataPath} 失败 (${res.status})`);
        const data = (await res.json()) as GeoJson;
        if (cancelled) return;
        setRawData(data);

        const map = mapRef.current;
        if (!map) return;
        const rebuild = () => rebuildPoiLayers(map, data);
        if (map.isStyleLoaded()) {
          rebuild();
        } else {
          map.once("idle", rebuild);
        }
      } catch (error) {
        console.error(error);
      }
    };

    loadData();

    return () => {
      cancelled = true;
    };
  }, [city, rebuildPoiLayers, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const clusterStyle = getClusterPaint(theme);
    const unclusteredStrokeColor = getCircleStrokeColor(theme);

    if (map.getLayer("unclustered")) {
      map.setPaintProperty("unclustered", "circle-color", createCircleColorExpression(theme, favSet));
      map.setPaintProperty("unclustered", "circle-stroke-color", unclusteredStrokeColor);
    }
    if (map.getLayer("clusters")) {
      map.setPaintProperty("clusters", "circle-color", clusterStyle.circleColor);
      map.setPaintProperty("clusters", "circle-stroke-color", clusterStyle.strokeColor);
    }
    if (map.getLayer("cluster-count")) {
      map.setPaintProperty("cluster-count", "text-color", clusterStyle.textColor);
    }
  }, [favSet, theme]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rawData) return;

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

    const source = map.getSource("pois") as GeoJSONSource | undefined;
    if (!source) return;

    source.setData({ type: "FeatureCollection", features: nextFeatures });

    if ((trimmed || onlyFav) && nextFeatures.length) {
      fitToFeatures(map, nextFeatures);
    }
  }, [query, searchField, onlyFav, favSet, rawData, fitToFeatures]);

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
  }, [query, searchField, onlyFav, favSet, rawData]);

  useEffect(() => {
    onSuggestionsChange?.(suggestions);
  }, [onSuggestionsChange, suggestions]);

  const handleSuggestionSelect = useCallback(
    (feature: GeoFeature) => {
      const map = mapRef.current;
      if (!map) return;
      const coordinates = feature.geometry.coordinates as LngLatLike;
      const currentZoom = map.getZoom();
      const targetZoom = Math.min(Math.max(currentZoom, UNCLUSTERED_ZOOM), map.getMaxZoom());
      const termLower = query.trim().toLowerCase();
      const highlightIncludeIndex =
        termLower.length > 0 ? computeIncludeHighlightIndex(feature.properties, searchField, termLower) : null;
      map.easeTo({ center: coordinates, zoom: targetZoom, duration: 600 });
      const popupOptions = highlightIncludeIndex != null ? { highlightIncludeIndex } : undefined;
      showPoiPopup(feature.properties, coordinates, popupOptions);
    },
    [query, searchField, showPoiPopup]
  );

  useEffect(() => {
    const handler: EventListener = event => {
      const { detail } = event as CustomEvent<{ id?: string }>;
      const id = detail?.id;
      if (!id || !rawData) return;
      const feature = rawData.features.find(item => item.properties.id === id);
      if (!feature) return;
      handleSuggestionSelect(feature);
    };

    window.addEventListener("focus-poi", handler);
    return () => window.removeEventListener("focus-poi", handler);
  }, [handleSuggestionSelect, rawData]);

  useEffect(() => {
    const handler = () => onShare([...favSetRef.current]);
    window.addEventListener("request-share-url", handler);
    return () => window.removeEventListener("request-share-url", handler);
  }, [onShare]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({ center: city.center as LngLatLike, zoom: Math.min(city.zoom, map.getMaxZoom()), duration: 600 });
  }, [city.center, city.zoom]);

  return (
    <>
      <div id="map" ref={containerRef} />
      {showSuggestions && suggestions.length > 0 && (
        <ul className="search-suggestions scrollable-card" aria-label={TEXT.searchLabel}>
          {suggestions.map(feature => {
            const props = feature.properties;
            const tagText = Array.isArray(props.tags) ? props.tags.map(escapeHtml).slice(0, 3).join(DOT) : "";
            const priceText = props.price ? escapeHtml(props.price) : "";
            const addressText = props.address ? `${escapeHtml(props.address)}` : "";
            const contactText = props.contact ? `${escapeHtml(props.contact)}` : "";
            const openHourText = props.openhour ? `${escapeHtml(props.openhour)}` : "";
            const scheduleLine = [openHourText, contactText].filter(Boolean).join(" ");
            const tagPriceLine = [tagText, priceText].filter(Boolean).join(DOT);
            const noteLine = props.notes ? `${escapeHtml(props.notes)}` : "";
            const lines = [
              { key: "schedule", text: scheduleLine, secondary: false },
              { key: "address", text: addressText, secondary: true },
              { key: "tagprice", text: tagPriceLine, secondary: false },
              { key: "note", text: noteLine, secondary: true }
            ].filter(item => item.text);

            return (
              <li key={props.id}>
                <button type="button" onClick={() => handleSuggestionSelect(feature)}>
                  <span className="search-suggestion-title" title={props.name}>
                    {props.name}
                  </span>
                  {lines.map(item => (
                    <span
                      key={`${props.id}-meta-${item.key}`}
                      className={`search-suggestion-meta${item.secondary ? " search-suggestion-meta--secondary" : ""}`}
                    >
                      {item.text}
                    </span>
                  ))}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function createUserLocationMarker(theme: ThemeMode) {
  const element = document.createElement("div");
  element.className = `user-location-marker user-location-marker--${theme}`;
  return element;
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

function createCircleColorExpression(theme: ThemeMode, favSet: Set<string>): any {
  const paletteKey = theme === "dark" ? "dark" : "light";
  const matchExpression: any[] = ["match", ["coalesce", ["get", "category"], DEFAULT_CATEGORY]];
  for (const [key, value] of Object.entries(CATEGORY_COLORS)) {
    matchExpression.push(key, value[paletteKey]);
  }
  const fallbackColor = CATEGORY_COLORS[DEFAULT_CATEGORY][paletteKey];
  matchExpression.push(fallbackColor);

  return [
    "case",
    ["in", ["get", "id"], ["literal", Array.from(favSet)]],
    "#f59e0b",
    matchExpression
  ];
}

type ClusterPaint = { circleColor: ExpressionSpecification; strokeColor: string; textColor: string };

function resolveCssColor(token: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value || fallback;
}

function getCircleStrokeColor(theme: ThemeMode) {
  return theme === "dark"
    ? resolveCssColor("--border-soft", "rgba(148, 163, 184, 0.45)")
    : "rgba(255, 255, 255, 0.95)";
}

function createClusterColorExpression(theme: ThemeMode): ExpressionSpecification {
  if (theme === "dark") {
    return [
      "step",
      ["get", "point_count"],
      "#8288a2",
      10,
      "#505676",
      30,
      "#424547",
      80,
      "#27254b"
    ] as ExpressionSpecification;
  }

  return [
    "step",
    
    ["get", "point_count"],
    "#93c5fd",
    10,
    "#60a5fa",
    30,
    "#3b82f6",
    80,
    "#1d4ed8"
  ] as ExpressionSpecification;
}

function getClusterPaint(theme: ThemeMode): ClusterPaint {
  return {
    circleColor: createClusterColorExpression(theme),
    strokeColor: getCircleStrokeColor(theme),
    textColor: resolveCssColor("--text-primary", theme === "dark" ? "#e2e8f0" : "#0f172a")
  };
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

function escapeHtml(text?: string) {
  return (text ?? "").replace(/[&<>"]/g, character => {
    const map: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };
    return map[character] ?? character;
  });
}
