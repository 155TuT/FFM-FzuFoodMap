import maplibregl, {
  type ExpressionSpecification,
  type LngLatLike,
  type Map as MapLibreMap
} from "maplibre-gl";
import type { GeoFeature, GeoJson } from "../../types";
import type { ThemeMode } from "../../theme";

export const UNCLUSTERED_ZOOM = 16;
const UNASSIGNED_REGION_ID = "__unassigned__";
const DEFAULT_CATEGORY = "门店";
const CATEGORY_COLORS: Record<string, { light: string; dark: string }> = {
  门店: { light: "#0ea5e9", dark: "#7dd3fc" },
  食堂: { light: "#22c55e", dark: "#86efac" },
  摊位: { light: "#8b5cf6", dark: "#c4b5fd" }
};

type LayerStyleOptions = {
  theme: ThemeMode;
  activeRegionId: string | null;
  citywideRegionId: string | null;
  regionIds: string[];
};

export function fitToFeatures(map: MapLibreMap, features: GeoFeature[]) {
  const bounds = new maplibregl.LngLatBounds();
  features.forEach(feature => bounds.extend(feature.geometry.coordinates as LngLatLike));
  if (!bounds.isEmpty()) {
    map.fitBounds(bounds, {
      padding: 40,
      maxZoom: Math.min(UNCLUSTERED_ZOOM, map.getMaxZoom())
    });
  }
}

export function replacePoiLayers(map: MapLibreMap, data: GeoJson, options: LayerStyleOptions) {
  removePoiLayers(map);

  map.addSource("pois", {
    type: "geojson",
    data,
    cluster: true,
    clusterMaxZoom: UNCLUSTERED_ZOOM - 1,
    clusterRadius: 48,
    clusterProperties: buildClusterProperties(options.regionIds)
  });

  const highlightAll = !options.activeRegionId || options.activeRegionId === options.citywideRegionId;
  const clusterPaint = getClusterPaint({ ...options, highlightAll });

  map.addLayer({
    id: "clusters",
    type: "circle",
    source: "pois",
    filter: ["has", "point_count"],
    paint: {
      "circle-color": clusterPaint.circleColor,
      "circle-radius": ["step", ["get", "point_count"], 14, 10, 18, 30, 22, 80, 28],
      "circle-stroke-width": 1.3,
      "circle-stroke-color": clusterPaint.strokeColor
    }
  });

  map.addLayer({
    id: "cluster-count",
    type: "symbol",
    source: "pois",
    filter: ["has", "point_count"],
    layout: { "text-field": "{point_count_abbreviated}", "text-size": 12 },
    paint: { "text-color": clusterPaint.textColor }
  });

  map.addLayer({
    id: "unclustered",
    type: "circle",
    source: "pois",
    filter: ["!", ["has", "point_count"]],
    paint: {
      "circle-color": createCircleColorExpression(options.theme, options.activeRegionId, highlightAll),
      "circle-radius": 6,
      "circle-stroke-width": 1.3,
      "circle-stroke-color": getCircleStrokeColor(options.theme)
    }
  });
}

export function updatePoiLayerPaint(map: MapLibreMap, options: LayerStyleOptions) {
  const highlightAll = !options.activeRegionId || options.activeRegionId === options.citywideRegionId;
  const clusterPaint = getClusterPaint({ ...options, highlightAll });

  if (map.getLayer("unclustered")) {
    map.setPaintProperty(
      "unclustered",
      "circle-color",
      createCircleColorExpression(options.theme, options.activeRegionId, highlightAll)
    );
    map.setPaintProperty("unclustered", "circle-stroke-color", getCircleStrokeColor(options.theme));
  }
  if (map.getLayer("clusters")) {
    map.setPaintProperty("clusters", "circle-color", clusterPaint.circleColor);
    map.setPaintProperty("clusters", "circle-stroke-color", clusterPaint.strokeColor);
  }
  if (map.getLayer("cluster-count")) {
    map.setPaintProperty("cluster-count", "text-color", clusterPaint.textColor);
  }
}

function removePoiLayers(map: MapLibreMap) {
  ["clusters", "cluster-count", "unclustered"].forEach(layerId => {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  });
  if (map.getSource("pois")) map.removeSource("pois");
}

function createCircleColorExpression(
  theme: ThemeMode,
  activeRegionId: string | null,
  highlightAll: boolean
): ExpressionSpecification {
  const paletteKey = theme === "dark" ? "dark" : "light";
  const categoryStops = Object.entries(CATEGORY_COLORS).flatMap(([category, colors]) => [
    category,
    colors[paletteKey]
  ]);
  const categoryExpression = [
    "match",
    ["coalesce", ["get", "category"], DEFAULT_CATEGORY],
    ...categoryStops,
    CATEGORY_COLORS[DEFAULT_CATEGORY][paletteKey]
  ] as unknown as ExpressionSpecification;

  if (highlightAll || !activeRegionId) return categoryExpression;

  const fadedColor = theme === "dark" ? "rgba(100, 116, 139, 0.45)" : "rgba(148, 163, 184, 0.5)";
  return [
    "case",
    ["==", ["coalesce", ["get", "regionId"], UNASSIGNED_REGION_ID], activeRegionId],
    categoryExpression,
    fadedColor
  ] as unknown as ExpressionSpecification;
}

function buildClusterProperties(regionIds: string[]) {
  return regionIds.reduce<Record<string, unknown>>((properties, regionId) => {
    properties[getClusterPropertyName(regionId)] = [
      "+",
      [
        "case",
        ["==", ["coalesce", ["get", "regionId"], UNASSIGNED_REGION_ID], regionId],
        1,
        0
      ],
      0
    ];
    return properties;
  }, {});
}

function createClusterColorExpression(
  theme: ThemeMode,
  highlightAll: boolean,
  activeRegionId: string | null,
  regionIds: string[]
): ExpressionSpecification {
  const baseExpression =
    theme === "dark"
      ? (["step", ["get", "point_count"], "#8288a2", 10, "#505676", 30, "#424547", 80, "#27254b"] as ExpressionSpecification)
      : (["step", ["get", "point_count"], "#93c5fd", 10, "#60a5fa", 30, "#3b82f6", 80, "#1d4ed8"] as ExpressionSpecification);

  if (highlightAll || !activeRegionId || !regionIds.includes(activeRegionId)) return baseExpression;

  return [
    "case",
    [">", ["get", getClusterPropertyName(activeRegionId)], 0],
    baseExpression,
    theme === "dark" ? "rgba(66, 70, 87, 0.7)" : "rgba(148, 163, 184, 0.55)"
  ] as unknown as ExpressionSpecification;
}

function getClusterPaint(options: LayerStyleOptions & { highlightAll: boolean }) {
  return {
    circleColor: createClusterColorExpression(
      options.theme,
      options.highlightAll,
      options.activeRegionId,
      options.regionIds
    ),
    strokeColor: getCircleStrokeColor(options.theme),
    textColor: resolveCssColor("--text-primary", options.theme === "dark" ? "#e2e8f0" : "#0f172a")
  };
}

function getClusterPropertyName(regionId: string) {
  return `count_${regionId}`;
}

function resolveCssColor(token: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(token).trim() || fallback;
}

function getCircleStrokeColor(theme: ThemeMode) {
  return theme === "dark"
    ? resolveCssColor("--border-soft", "rgba(148, 163, 184, 0.45)")
    : "rgba(255, 255, 255, 0.95)";
}
