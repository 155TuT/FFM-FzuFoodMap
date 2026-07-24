import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl, {
  type GeoJSONSource,
  type LngLatLike,
  type Map as MapLibreMap,
  type MapGeoJSONFeature,
  type MapLayerMouseEvent
} from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import "./MapView.css";
import type { CityConfig } from "../../cities";
import type { GeoFeature, GeoJson, SearchField } from "../../types";
import type { ThemeMode } from "../../theme";
import { findMatchingIncludeIndex } from "../search/searchPois";
import {
  fitToFeatures,
  replacePoiLayers,
  UNCLUSTERED_ZOOM,
  updatePoiLayerPaint
} from "./mapLayers";
import { usePoiPopup } from "./usePoiPopup";
import { useUserLocation } from "./useUserLocation";

const UNASSIGNED_REGION_ID = "__unassigned__";

export type MapFocusRequest = {
  feature: GeoFeature;
  field: SearchField;
  query: string;
  requestId: number;
};

type MapViewProps = {
  city: CityConfig;
  activeRegionId: string | null;
  data: GeoJson | null;
  visibleFeatures: GeoFeature[];
  fitVisibleFeatures: boolean;
  focusRequest: MapFocusRequest | null;
  theme: ThemeMode;
  trackUserLocation: boolean;
  onUserLocationError?: (message: string) => void;
  onUserLocationChange?: (tracking: boolean) => void;
};

export default function MapView({
  city,
  activeRegionId,
  data,
  visibleFeatures,
  fitVisibleFeatures,
  focusRequest,
  theme,
  trackUserLocation,
  onUserLocationError,
  onUserLocationChange
}: MapViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const dataRef = useRef<GeoJson | null>(data);
  const visibleFeaturesRef = useRef(visibleFeatures);
  const layerOptionsRef = useRef(getLayerOptions(city, activeRegionId, theme));
  const appliedStyleUrlRef = useRef("");
  const [mapReady, setMapReady] = useState(false);
  const { showPoiPopup, closePopup } = usePoiPopup(mapRef);

  const styleUrl = useMemo(() => {
    const key = import.meta.env.VITE_MAPTILER_KEY || "YOUR_KEY";
    const styleName = theme === "dark" ? "streets-v4-dark" : "streets-v4";
    return `https://api.maptiler.com/maps/${styleName}/style.json?key=${key}`;
  }, [theme]);
  const latestStyleUrlRef = useRef(styleUrl);
  latestStyleUrlRef.current = styleUrl;

  const layerOptions = useMemo(
    () => getLayerOptions(city, activeRegionId, theme),
    [activeRegionId, city, theme]
  );
  layerOptionsRef.current = layerOptions;
  dataRef.current = data;
  visibleFeaturesRef.current = visibleFeatures;

  useEffect(() => {
    if (!containerRef.current) return;

    setMapReady(false);
    appliedStyleUrlRef.current = latestStyleUrlRef.current;
    const map = new maplibregl.Map({
      container: containerRef.current,
      style: latestStyleUrlRef.current,
      center: city.center,
      zoom: city.zoom,
      maxZoom: 19
    });
    mapRef.current = map;

    const typedMap = map as MapLibreMap & { setPrefetchZoomDelta?: (delta: number) => void };
    typedMap.setPrefetchZoomDelta?.(0);

    const handleLoad = () => setMapReady(true);
    const handleStyleLoad = () => {
      const currentData = dataRef.current;
      if (!currentData) return;
      replacePoiLayers(
        map,
        { type: "FeatureCollection", features: visibleFeaturesRef.current },
        layerOptionsRef.current
      );
    };
    const handleClusterClick = (event: MapLayerMouseEvent) => {
      const features = map.queryRenderedFeatures(event.point, {
        layers: ["clusters"]
      }) as MapGeoJSONFeature[];
      const clusterFeature = features[0];
      const clusterId = clusterFeature?.properties?.cluster_id;
      if (typeof clusterId !== "number") return;

      const source = map.getSource("pois") as GeoJSONSource | undefined;
      if (!source) return;
      void source
        .getClusterExpansionZoom(clusterId)
        .then(zoom => {
          if (zoom === undefined || clusterFeature.geometry?.type !== "Point") return;
          map.easeTo({
            center: clusterFeature.geometry.coordinates as LngLatLike,
            zoom: Math.min(zoom, map.getMaxZoom())
          });
        })
        .catch(() => undefined);
    };
    const handlePoiClick = (event: MapLayerMouseEvent) => {
      const feature = event.features?.[0];
      if (!feature || feature.geometry?.type !== "Point") return;

      const id = (feature.properties as { id?: unknown } | undefined)?.id;
      const poi =
        typeof id === "string"
          ? dataRef.current?.features.find(item => item.properties.id === id)?.properties
          : undefined;
      if (!poi) return;

      const coordinates = feature.geometry.coordinates as LngLatLike;
      map.easeTo({
        center: coordinates,
        zoom: Math.min(Math.max(map.getZoom(), UNCLUSTERED_ZOOM), map.getMaxZoom())
      });
      showPoiPopup(poi, coordinates);
    };
    const showPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const hidePointer = () => {
      map.getCanvas().style.cursor = "";
    };

    map.on("load", handleLoad);
    map.on("style.load", handleStyleLoad);
    map.on("click", "clusters", handleClusterClick);
    map.on("click", "unclustered", handlePoiClick);
    map.on("mouseenter", "clusters", showPointer);
    map.on("mouseenter", "unclustered", showPointer);
    map.on("mouseleave", "clusters", hidePointer);
    map.on("mouseleave", "unclustered", hidePointer);

    return () => {
      map.off("load", handleLoad);
      map.off("style.load", handleStyleLoad);
      map.off("click", "clusters", handleClusterClick);
      map.off("click", "unclustered", handlePoiClick);
      map.off("mouseenter", "clusters", showPointer);
      map.off("mouseenter", "unclustered", showPointer);
      map.off("mouseleave", "clusters", hidePointer);
      map.off("mouseleave", "unclustered", hidePointer);
      closePopup();
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, [city, closePopup, showPoiPopup]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || appliedStyleUrlRef.current === styleUrl) return;
    appliedStyleUrlRef.current = styleUrl;
    setMapReady(false);
    map.setStyle(styleUrl);
    map.once("idle", () => setMapReady(true));
  }, [styleUrl]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !data || !map.isStyleLoaded()) return;

    replacePoiLayers(
      map,
      { type: "FeatureCollection", features: visibleFeaturesRef.current },
      layerOptionsRef.current
    );
    focusActiveRegion(map, city, activeRegionId, data.features);
  }, [activeRegionId, city, data, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    const source = map?.getSource("pois") as GeoJSONSource | undefined;
    if (!map || !source) return;

    source.setData({ type: "FeatureCollection", features: visibleFeatures });
    if (fitVisibleFeatures && visibleFeatures.length) {
      fitToFeatures(map, visibleFeatures);
    }
  }, [fitVisibleFeatures, visibleFeatures]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) updatePoiLayerPaint(map, layerOptions);
  }, [layerOptions]);

  useEffect(() => {
    const map = mapRef.current;
    if (map) focusActiveRegion(map, city, activeRegionId);
  }, [activeRegionId, city]);

  useEffect(() => {
    if (!focusRequest) return;
    const map = mapRef.current;
    if (!map) return;

    const { feature, field, query } = focusRequest;
    const coordinates = feature.geometry.coordinates as LngLatLike;
    map.easeTo({
      center: coordinates,
      zoom: Math.min(Math.max(map.getZoom(), UNCLUSTERED_ZOOM), map.getMaxZoom()),
      duration: 600
    });
    const highlightIncludeIndex = findMatchingIncludeIndex(feature.properties, field, query);
    showPoiPopup(
      feature.properties,
      coordinates,
      highlightIncludeIndex == null ? undefined : { highlightIncludeIndex }
    );
  }, [focusRequest, showPoiPopup]);

  useUserLocation({
    mapRef,
    mapReady,
    tracking: trackUserLocation,
    theme,
    onError: onUserLocationError,
    onTrackingChange: onUserLocationChange
  });

  return (
    <>
      <div id="map" ref={containerRef} />
      {(!mapReady || !data) && (
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
    </>
  );
}

function getLayerOptions(city: CityConfig, activeRegionId: string | null, theme: ThemeMode) {
  const regionIds = city.regions.map(region => region.id);
  if (!regionIds.includes(UNASSIGNED_REGION_ID)) regionIds.push(UNASSIGNED_REGION_ID);

  return {
    theme,
    activeRegionId,
    citywideRegionId:
      city.regions.find(region => region.isCitywide)?.id ??
      city.defaultRegionId ??
      city.regions[0]?.id ??
      null,
    regionIds
  };
}

function focusActiveRegion(
  map: MapLibreMap,
  city: CityConfig,
  activeRegionId: string | null,
  fallbackFeatures?: GeoFeature[]
) {
  const targetRegion =
    city.regions.find(region => region.id === activeRegionId) ??
    city.regions.find(region => region.isCitywide) ??
    null;

  if (targetRegion?.isCitywide && fallbackFeatures?.length) {
    fitToFeatures(map, fallbackFeatures);
    return;
  }

  map.easeTo({
    center: (targetRegion?.center ?? city.center) as LngLatLike,
    zoom: Math.min(targetRegion?.zoom ?? city.zoom, map.getMaxZoom()),
    duration: 600
  });
}
