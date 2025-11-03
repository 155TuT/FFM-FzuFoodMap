import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type LngLatLike,
  type Map as MapLibreMap,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { CityConfig } from "../cities";
import type { GeoFeature, GeoJson, PoiProps, SearchField } from "../types";
import { getFavs, setFavs, toggleFav } from "../utils/favorites";
import { parseFavFromUrl } from "../utils/share";

const SEARCH_LIMIT = 8;
const DOT = " \u00b7 ";
const CATEGORY_COLORS: Record<string, { light: string; dark: string }> = {
  门店: { light: "#38bdf8", dark: "#38bdf8" },
  食堂: { light: "#34d399", dark: "#34d399" },
  摊位: { light: "#fbbf24", dark: "#facc15" },
  连锁: { light: "#a78bfa", dark: "#c084fc" },
  外卖: { light: "#fb7185", dark: "#fb7185" }
};
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

  const fitToFeatures = useCallback((map: MapLibreMap, feats: GeoFeature[]) => {
    const bounds = new maplibregl.LngLatBounds();
    feats.forEach(feature => bounds.extend(feature.geometry.coordinates as LngLatLike));
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 40, maxZoom: Math.min(15, map.getMaxZoom()) });
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
        clusterMaxZoom: 14,
        clusterRadius: 48
      });

      map.addLayer({
        id: "clusters",
        type: "circle",
        source: "pois",
        filter: ["has", "point_count"],
        paint: {
          "circle-color": [
            "step",
            ["get", "point_count"],
            "#93c5fd",
            10,
            "#60a5fa",
            30,
            "#3b82f6",
            80,
            "#1d4ed8"
          ],
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
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "white"
        }
      });

      map.addLayer({
        id: "cluster-count",
        type: "symbol",
        source: "pois",
        filter: ["has", "point_count"],
        layout: { "text-field": "{point_count_abbreviated}", "text-size": 12 },
        paint: { "text-color": "#0b1b36" }
      });

      map.addLayer({
        id: "unclustered",
        type: "circle",
        source: "pois",
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-color": createCircleColorExpression(themeRef.current, favSetRef.current),
          "circle-radius": 6,
          "circle-stroke-width": 1.2,
          "circle-stroke-color": "white"
        }
      });

      fitToFeatures(map, data.features);
    },
    [fitToFeatures]
  );

  const showPoiPopup = useCallback(
    (poi: PoiProps, coordinates: LngLatLike) => {
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
      const noteHtml = poi.notes ? `<div class="poi-notes">${escapeHtml(poi.notes)}</div>` : "";
      const detailLinkHtml = poi.url
        ? `<a href="${poi.url}" target="_blank" rel="noopener noreferrer">${TEXT.details}</a>`
        : "";

      const html = `
        <div class="poi-title">${escapeHtml(poi.name)}</div>
        ${scheduleLine ? `<div class="poi-meta">${scheduleLine}</div>` : ""}
        ${addressLine ? `<div class="poi-meta">${addressLine}</div>` : ""}
        ${tagPriceLine ? `<div class="poi-meta">${tagPriceLine}</div>` : ""}
        ${noteHtml}
        <div class="poi-actions">
          ${detailLinkHtml}
          <button class="fav-btn" data-id="${poi.id}" type="button">${
            favSetRef.current.has(poi.id) ? TEXT.collected : TEXT.collect
          }</button>
        </div>
      `;

      popup.setLngLat(coordinates).setHTML(html).addTo(map);

      queueMicrotask(() => {
        const element = popup.getElement();
        const btn = element?.querySelector<HTMLButtonElement>(".fav-btn");
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
      maxZoom: 17
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
      const props = feature.properties as PoiProps | undefined;
      if (!props) return;
      const coordinates = feature.geometry.coordinates as LngLatLike;
      const targetZoom = Math.min(Math.max(map.getZoom(), 15), map.getMaxZoom());
      map.easeTo({ center: coordinates, zoom: targetZoom });
      showPoiPopup(props, coordinates);
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
            const targetZoom = Math.min(Math.max(map.getZoom(), 15), map.getMaxZoom());
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
    if (!map || !map.getLayer("unclustered")) return;
    map.setPaintProperty("unclustered", "circle-color", createCircleColorExpression(theme, favSet));
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
      const targetZoom = Math.min(Math.max(currentZoom, 15), map.getMaxZoom());
      map.easeTo({ center: coordinates, zoom: targetZoom, duration: 600 });
      showPoiPopup(feature.properties, coordinates);
    },
    [showPoiPopup]
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
        <ul className="search-suggestions" aria-label={TEXT.searchLabel}>
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
  const matchExpression: any[] = ["match", ["coalesce", ["get", "category"], "门店"]];
  for (const [key, value] of Object.entries(CATEGORY_COLORS)) {
    matchExpression.push(key, value[paletteKey]);
  }
  const fallbackColor = CATEGORY_COLORS["门店"][paletteKey];
  matchExpression.push(fallbackColor);

  return [
    "case",
    ["in", ["get", "id"], ["literal", Array.from(favSet)]],
    "#f59e0b",
    matchExpression
  ];
}

function matchesSearch(feature: GeoFeature, field: SearchField, termLower: string) {
  const { properties } = feature;
  if (field === "name") {
    return properties.name.toLowerCase().includes(termLower);
  }
  if (field === "tags") {
    return (properties.tags ?? []).some(tag => tag.toLowerCase().includes(termLower));
  }
  if (field === "notes") {
    return (properties.notes ?? "").toLowerCase().includes(termLower);
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
