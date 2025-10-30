import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import type {
  GeoJSONSource,
  LngLatLike,
  Map,
  MapGeoJSONFeature,
  MapLayerMouseEvent
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import Fuse from "fuse.js";
import type { CityConfig } from "../cities";
import type { GeoFeature, GeoJson, PoiProps } from "../types";
import { getFavs, setFavs, toggleFav } from "../utils/favorites";
import { parseFavFromUrl } from "../utils/share";

const SEARCH_LIMIT = 8;
const STAR = "\u2605";
const TEXT = {
  details: "\u8be6\u60c5",
  collect: "\u6536\u85cf",
  collected: "\u5df2\u6536\u85cf",
  searchLabel: "\u641c\u7d22\u7ed3\u679c"
} as const;

type Props = {
  city: CityConfig;
  query: string;
  onlyFav: boolean;
  theme: "light" | "dark";
  onShare: (favIds: string[]) => void;
};

export default function MapView({ city, query, onlyFav, theme, onShare }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<Map | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);

  const [rawData, setRawData] = useState<GeoJson | null>(null);
  const [favSet, setFavSet] = useState<Set<string>>(() => getFavs());
  const favSetRef = useRef(favSet);
  const fuseRef = useRef<Fuse<GeoFeature> | null>(null);
  const [suggestions, setSuggestions] = useState<GeoFeature[]>([]);

  const styleUrl = useMemo(() => {
    const key = import.meta.env.VITE_MAPTILER_KEY || "YOUR_KEY";
    const styleId = theme === "dark" ? "streets-v4-dark" : "streets-v4";
    return `https://api.maptiler.com/maps/${styleId}/style.json?key=${key}`;
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
    favSetRef.current = favSet;
  }, [favSet]);

  const fitToFeatures = useCallback((map: Map, feats: GeoFeature[]) => {
    const bounds = new maplibregl.LngLatBounds();
    feats.forEach(feature => bounds.extend(feature.geometry.coordinates as LngLatLike));
    if (!bounds.isEmpty()) {
      map.fitBounds(bounds, { padding: 40, maxZoom: 16 });
    }
  }, []);

  const rebuildPoiLayers = useCallback((map: Map, data: GeoJson) => {
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
        "circle-color": [
          "case",
          ["in", ["get", "id"], ["literal", [...favSetRef.current]]],
          "#f59e0b",
          "#0ea5e9"
        ],
        "circle-radius": 6,
        "circle-stroke-width": 1.2,
        "circle-stroke-color": "white"
      }
    });

    fitToFeatures(map, data.features);
  }, [fitToFeatures]);

  const showPoiPopup = useCallback((poi: PoiProps, coordinates: LngLatLike) => {
    const map = mapRef.current;
    if (!map) return;

    if (!popupRef.current) {
      popupRef.current = new maplibregl.Popup({ offset: 10, closeButton: false, maxWidth: "260px" });
    }

    const popup = popupRef.current;
    const tagText = Array.isArray(poi.tags) ? poi.tags.map(escapeHtml).join(" \u00b7 ") : "";
    const priceText = poi.price ? escapeHtml(poi.price) : "";
    const ratingText = poi.rating != null ? `推荐程度 ${poi.rating} ${STAR}` : "";
    const metaParts = [tagText, priceText, ratingText].filter(Boolean).join(" \u00b7 ");

    const html = `
      <div class="poi-title">${escapeHtml(poi.name)}</div>
      ${metaParts ? `<div class="poi-meta">${metaParts}</div>` : ""}
      ${poi.notes ? `<div class="poi-notes">${escapeHtml(poi.notes)}</div>` : ""}
      ${poi.url ? `<div><a href="${poi.url}" target="_blank" rel="noopener">${TEXT.details}</a></div>` : ""}
      <button class="fav-btn" data-id="${poi.id}">${favSetRef.current.has(poi.id) ? TEXT.collected : TEXT.collect}</button>
    `;

    popup.setLngLat(coordinates).setHTML(html).addTo(map);

    queueMicrotask(() => {
      const btn = popup.getElement()?.querySelector<HTMLButtonElement>(".fav-btn");
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
  }, []);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: city.center,
      zoom: city.zoom
    });

    mapRef.current = map;

    const handleClusterClick = (e: MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(e.point, { layers: ["clusters"] }) as MapGeoJSONFeature[];
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
          map.easeTo({ center: geometry.coordinates as LngLatLike, zoom });
        })
        .catch(() => undefined);
    };

    const handlePoiClick = (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature || feature.geometry?.type !== "Point") return;
      const props = feature.properties as PoiProps | undefined;
      if (!props) return;
      const coordinates = feature.geometry.coordinates as LngLatLike;
      map.easeTo({ center: coordinates, zoom: Math.max(map.getZoom(), 15) });
      showPoiPopup(props, coordinates);
    };

    map.on("click", "clusters", handleClusterClick);
    map.on("click", "unclustered", handlePoiClick);
    map.on("mouseenter", "clusters", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseenter", "unclustered", () => { map.getCanvas().style.cursor = "pointer"; });
    map.on("mouseleave", "clusters", () => { map.getCanvas().style.cursor = ""; });
    map.on("mouseleave", "unclustered", () => { map.getCanvas().style.cursor = ""; });

    return () => {
      map.off("click", "clusters", handleClusterClick);
      map.off("click", "unclustered", handlePoiClick);
      map.remove();
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current = null;
    };
  }, [city.center, city.zoom, showPoiPopup, styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.setStyle(styleUrl);
  }, [styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rawData) return;

    const applyLayers = () => rebuildPoiLayers(map, rawData);

    if (map.isStyleLoaded()) {
      applyLayers();
      return undefined;
    }

    const onIdle = () => {
      map.off("idle", onIdle);
      applyLayers();
    };

    map.on("idle", onIdle);
    return () => {
      map.off("idle", onIdle);
    };
  }, [rawData, styleUrl, rebuildPoiLayers]);

  useEffect(() => {
    const handler = () => onShare([...favSetRef.current]);
    window.addEventListener("request-share-url", handler);
    return () => window.removeEventListener("request-share-url", handler);
  }, [onShare]);

  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      try {
        const baseUrl = window.location.origin + import.meta.env.BASE_URL;
        const dataUrl = new URL(city.dataPath, baseUrl).toString();
        const res = await fetch(dataUrl);
        if (!res.ok) throw new Error(`\u52a0\u8f7d ${city.dataPath} \u5931\u8d25 (${res.status})`);
        const data = (await res.json()) as GeoJson;
        if (cancelled) return;
        setRawData(data);
        fuseRef.current = new Fuse(data.features, {
          threshold: 0.35,
          keys: ["properties.name", "properties.tags", "properties.notes", "properties.price"]
        });
      } catch (error) {
        console.error(error);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [city]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer("unclustered")) return;
    map.setPaintProperty("unclustered", "circle-color", [
      "case",
      ["in", ["get", "id"], ["literal", [...favSet]]],
      "#f59e0b",
      "#0ea5e9"
    ]);
  }, [favSet]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !rawData) return;

    const trimmed = query.trim();
    let features = rawData.features;

    if (trimmed && fuseRef.current) {
      features = fuseRef.current.search(trimmed).map(result => result.item);
    }

    if (onlyFav) {
      features = features.filter(feature => favSet.has(feature.properties.id));
    }

    const source = map.getSource("pois");
    if (!source) return;

    (source as GeoJSONSource).setData({ type: "FeatureCollection", features });

    if (features.length) {
      fitToFeatures(map, features);
    }
  }, [query, onlyFav, favSet, rawData, fitToFeatures]);

  useEffect(() => {
    if (!rawData) {
      setSuggestions([]);
      return;
    }

    const trimmed = query.trim();
    if (!trimmed) {
      setSuggestions([]);
      return;
    }

    let matches: GeoFeature[];
    const fuse = fuseRef.current;

    if (fuse) {
      matches = fuse.search(trimmed, { limit: SEARCH_LIMIT * 2 }).map(result => result.item);
    } else {
      matches = rawData.features.filter(feature => {
        const props = feature.properties;
        return (
          props.name.includes(trimmed) ||
          props.tags?.some(tag => tag.includes(trimmed)) ||
          props.notes?.includes(trimmed) ||
          props.price?.includes(trimmed)
        );
      });
    }

    if (onlyFav) {
      matches = matches.filter(feature => favSet.has(feature.properties.id));
    }

    const unique: GeoFeature[] = [];
    const seen = new Set<string>();
    for (const feature of matches) {
      const id = feature.properties.id;
      if (seen.has(id)) continue;
      seen.add(id);
      unique.push(feature);
      if (unique.length >= SEARCH_LIMIT) break;
    }

    setSuggestions(unique);
  }, [query, rawData, onlyFav, favSet]);

  const handleSuggestionSelect = useCallback(
    (feature: GeoFeature) => {
      const map = mapRef.current;
      if (!map) return;
      const coordinates = feature.geometry.coordinates as LngLatLike;
      map.easeTo({ center: coordinates, zoom: Math.max(map.getZoom(), 16), duration: 600 });
      showPoiPopup(feature.properties, coordinates);
    },
    [showPoiPopup]
  );

  return (
    <>
      <div id="map" ref={containerRef} />
      {suggestions.length > 0 && (
        <ul className="search-suggestions" aria-label={TEXT.searchLabel}>
          {suggestions.map(feature => {
            const props = feature.properties;
            const tagText = Array.isArray(props.tags) ? props.tags.map(escapeHtml).slice(0, 3).join(" \u00b7 ") : "";
            const priceText = props.price ?? "";
            const ratingText = props.rating != null ? `${STAR} ${props.rating}` : "";
            const meta = [tagText, priceText, ratingText].filter(Boolean).join(" \u00b7 ");

            return (
              <li key={props.id}>
                <button type="button" onClick={() => handleSuggestionSelect(feature)}>
                  <span className="search-suggestion-title" title={props.name}>{props.name}</span>
                  {meta && <span className="search-suggestion-meta">{meta}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

function escapeHtml(text?: string) {
  return (text ?? "").replace(/[&<>"]/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char]!));
}
