import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyBaiduMapTheme,
  createBMapPoint,
  getBaiduMapAk,
  getBaiduMapMissingAkMessage,
  loadBaiduMapApi,
  roundCoordinates,
  type BMapEvent,
  type BMapGLNamespace,
  type BMapMap,
  type BMapMarker
} from "../../../fzu-food-map/src/utils/baiduMap";

const CATEGORY_COLORS: Record<string, string> = {
  门店: "#0ea5e9",
  食堂: "#22c55e",
  摊位: "#8b5cf6",
  小摊: "#8b5cf6"
};

type Props = {
  category: string;
  coordinates: [number, number];
  onChangeCoordinates: (next: [number, number]) => void;
};

export default function MiniMap({ category, coordinates, onChangeCoordinates }: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<BMapMap | null>(null);
  const markerRef = useRef<BMapMarker | null>(null);
  const baiduMapApiRef = useRef<BMapGLNamespace | null>(null);
  const onChangeRef = useRef(onChangeCoordinates);
  const [error, setError] = useState<string | null>(null);

  const ak = useMemo(() => getBaiduMapAk(), []);
  onChangeRef.current = onChangeCoordinates;

  useEffect(() => {
    if (!containerRef.current) return;

    if (!ak) {
      setError(getBaiduMapMissingAkMessage());
      return;
    }

    let cancelled = false;
    const cleanups: Array<() => void> = [];

    void loadBaiduMapApi(ak)
      .then(BMapGL => {
        if (cancelled || !containerRef.current) return;

        baiduMapApiRef.current = BMapGL;
        const map = new BMapGL.Map(containerRef.current, {
          minZoom: 3,
          maxZoom: 19,
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

        map.centerAndZoom(createBMapPoint(BMapGL, coordinates), 15);
        map.enableScrollWheelZoom();
        map.setDisplayOptions({
          poi: false,
          poiText: false,
          poiIcon: false,
          overlay: true,
          building: false,
          indoor: false
        });
        applyBaiduMapTheme(map, "light");

        const marker = new BMapGL.Marker(createBMapPoint(BMapGL, coordinates), {
          icon: createMiniMapMarkerIcon(BMapGL, category),
          enableDragging: true,
          title: "当前点位"
        });
        map.addOverlay(marker);

        const handleDragEnd = () => {
          const position = marker.getPosition();
          onChangeRef.current(roundCoordinates([position.lng, position.lat]));
        };

        const handleMapClick = (event: BMapEvent) => {
          const point = event.latlng ?? event.point;
          if (!point) return;
          const next = roundCoordinates([point.lng, point.lat]);
          marker.setPosition(createBMapPoint(BMapGL, next));
          onChangeRef.current(next);
        };

        marker.addEventListener?.("dragend", handleDragEnd);
        map.addEventListener("click", handleMapClick);

        cleanups.push(
          () => marker.removeEventListener?.("dragend", handleDragEnd),
          () => map.removeEventListener("click", handleMapClick)
        );

        mapRef.current = map;
        markerRef.current = marker;
        setError(null);
      })
      .catch(loadError => {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "百度地图加载失败");
        }
      });

    return () => {
      cancelled = true;
      cleanups.forEach(cleanup => cleanup());
      const map = mapRef.current;
      if (markerRef.current && map) {
        map.removeOverlay(markerRef.current);
      }
      markerRef.current = null;
      mapRef.current?.destroy?.();
      mapRef.current = null;
      baiduMapApiRef.current = null;
    };
  }, [ak]);

  useEffect(() => {
    const marker = markerRef.current;
    const map = mapRef.current;
    const BMapGL = baiduMapApiRef.current;
    if (!marker || !map || !BMapGL) {
      return;
    }

    marker.setPosition(createBMapPoint(BMapGL, coordinates));
    marker.setIcon(createMiniMapMarkerIcon(BMapGL, category));
    map.panTo(createBMapPoint(BMapGL, coordinates), { noAnimation: false });
  }, [category, coordinates]);

  return (
    <div className="mini-map-shell">
      <div className="mini-map" ref={containerRef}>
        {error ? <div className="mini-map__error">{error}</div> : null}
      </div>
      <p className="mini-map__hint">拖动标记或点击地图即可更新当前点位坐标。</p>
    </div>
  );
}

function createMiniMapMarkerIcon(BMapGL: BMapGLNamespace, category: string) {
  const size = 20;
  const fill = CATEGORY_COLORS[category] ?? CATEGORY_COLORS["门店"];
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${size / 2}" cy="${size / 2}" r="${size / 2 - 3}" fill="${fill}" stroke="rgba(255,255,255,0.96)" stroke-width="3" />
    </svg>
  `;

  return new BMapGL.Icon(`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`, new BMapGL.Size(size, size), {
    anchor: new BMapGL.Size(size / 2, size / 2)
  });
}
