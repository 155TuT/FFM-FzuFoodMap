import { useCallback, useEffect, useRef, type RefObject } from "react";
import maplibregl, { type LngLatLike, type Map as MapLibreMap } from "maplibre-gl";
import type { ThemeMode } from "../../theme";
import { UNCLUSTERED_ZOOM } from "./mapLayers";

type UserLocationOptions = {
  mapRef: RefObject<MapLibreMap | null>;
  mapReady: boolean;
  tracking: boolean;
  theme: ThemeMode;
  onError?: (message: string) => void;
  onTrackingChange?: (tracking: boolean) => void;
};

export function useUserLocation({
  mapRef,
  mapReady,
  tracking,
  theme,
  onError,
  onTrackingChange
}: UserLocationOptions) {
  const watchIdRef = useRef<number | null>(null);
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const hasCenteredRef = useRef(false);
  const isActiveRef = useRef(false);
  const themeRef = useRef(theme);
  themeRef.current = theme;

  const stopTracking = useCallback(
    (notify = true) => {
      if (watchIdRef.current != null && typeof navigator !== "undefined" && "geolocation" in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
      markerRef.current?.remove();
      markerRef.current = null;
      hasCenteredRef.current = false;
      isActiveRef.current = false;
      if (notify) onTrackingChange?.(false);
    },
    [onTrackingChange]
  );

  useEffect(() => {
    if (!tracking) {
      stopTracking();
      return;
    }
    if (!mapReady || !mapRef.current) return;

    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      onError?.("当前浏览器不支持定位功能");
      stopTracking();
      return;
    }

    try {
      watchIdRef.current = navigator.geolocation.watchPosition(
        position => {
          const coordinates: LngLatLike = [position.coords.longitude, position.coords.latitude];
          const map = mapRef.current;
          if (!map) return;

          if (!markerRef.current) {
            markerRef.current = new maplibregl.Marker({
              element: createUserLocationMarker(themeRef.current)
            })
              .setLngLat(coordinates)
              .addTo(map);
          } else {
            markerRef.current.setLngLat(coordinates);
          }

          if (!hasCenteredRef.current) {
            map.easeTo({
              center: coordinates,
              zoom: Math.min(Math.max(map.getZoom(), UNCLUSTERED_ZOOM), map.getMaxZoom()),
              duration: 600
            });
            hasCenteredRef.current = true;
          }

          if (!isActiveRef.current) {
            isActiveRef.current = true;
            onTrackingChange?.(true);
          }
        },
        error => {
          onError?.(getGeolocationErrorMessage(error));
          stopTracking();
        },
        { enableHighAccuracy: true, maximumAge: 15000, timeout: 20000 }
      );
    } catch (error) {
      console.error(error);
      onError?.("定位功能被浏览器阻止，无法显示当前位置");
      stopTracking();
    }

    return () => stopTracking(false);
  }, [mapReady, mapRef, onError, onTrackingChange, stopTracking, tracking]);

  useEffect(() => {
    const marker = markerRef.current;
    if (marker) marker.getElement().className = `user-location-marker user-location-marker--${theme}`;
  }, [theme]);

  useEffect(() => () => stopTracking(false), [stopTracking]);
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
