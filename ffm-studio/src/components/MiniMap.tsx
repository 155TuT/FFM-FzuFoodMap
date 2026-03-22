import { useEffect, useMemo, useRef } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";

const CATEGORY_COLORS: Record<string, string> = {
  门店: "#0ea5e9",
  食堂: "#22c55e",
  摊位: "#8b5cf6",
  小摊: "#8b5cf6"
};

type Props = {
  category: string;
  theme: "light" | "dark";
  coordinates: [number, number];
  onChangeCoordinates: (next: [number, number]) => void;
};

function buildMarker(category: string) {
  const element = document.createElement("div");
  element.className = "mini-map-marker";
  element.style.background = CATEGORY_COLORS[category] ?? CATEGORY_COLORS["门店"];
  return element;
}

export default function MiniMap({ category, theme, coordinates, onChangeCoordinates }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const onChangeCoordinatesRef = useRef(onChangeCoordinates);
  const appliedStyleUrlRef = useRef<string | null>(null);
  const styleUrl = useMemo(() => {
    const key = import.meta.env.VITE_MAPTILER_KEY || "YOUR_KEY";
    const styleName = theme === "dark" ? "streets-v4-dark" : "streets-v4";
    return `https://api.maptiler.com/maps/${styleName}/style.json?key=${key}`;
  }, [theme]);

  useEffect(() => {
    onChangeCoordinatesRef.current = onChangeCoordinates;
  }, [onChangeCoordinates]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) {
      return;
    }

    const markerElement = buildMarker(category);
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: styleUrl,
      center: coordinates,
      zoom: 15
    });
    appliedStyleUrlRef.current = styleUrl;

    const marker = new maplibregl.Marker({ element: markerElement, draggable: true })
      .setLngLat(coordinates)
      .addTo(map);

    marker.on("dragend", () => {
      const lngLat = marker.getLngLat();
      onChangeCoordinatesRef.current([Number(lngLat.lng.toFixed(8)), Number(lngLat.lat.toFixed(8))]);
    });

    map.on("click", event => {
      const next: [number, number] = [
        Number(event.lngLat.lng.toFixed(8)),
        Number(event.lngLat.lat.toFixed(8))
      ];
      marker.setLngLat(next);
      onChangeCoordinatesRef.current(next);
    });

    mapRef.current = map;
    markerRef.current = marker;

    return () => {
      marker.remove();
      map.remove();
      markerRef.current = null;
      mapRef.current = null;
      appliedStyleUrlRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedStyleUrlRef.current === styleUrl) {
      return;
    }

    appliedStyleUrlRef.current = styleUrl;
    map.setStyle(styleUrl);
  }, [styleUrl]);

  useEffect(() => {
    const marker = markerRef.current;
    const map = mapRef.current;
    if (!marker || !map) {
      return;
    }

    marker.setLngLat(coordinates);
    marker.getElement().style.background = CATEGORY_COLORS[category] ?? CATEGORY_COLORS["门店"];
    map.easeTo({ center: coordinates, duration: 250 });
  }, [category, coordinates]);

  return (
    <div className="mini-map-shell">
      <div className="mini-map" ref={containerRef} />
      <p className="mini-map__hint">拖动标记或点击地图即可更新当前点位坐标</p>
    </div>
  );
}
