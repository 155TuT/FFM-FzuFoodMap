export type Coordinates = [number, number];

export type BMapPoint = {
  lng: number;
  lat: number;
};

export type BMapPixel = {
  x: number;
  y: number;
};

export type BMapSize = {
  width: number;
  height: number;
};

export type BMapBounds = {
  containsPoint(point: BMapPoint): boolean;
  extend(point: BMapPoint): void;
  getCenter(): BMapPoint;
  getNorthEast(): BMapPoint;
  getSouthWest(): BMapPoint;
  isEmpty(): boolean;
};

export type BMapEvent = {
  type: string;
  target: unknown;
  latlng?: BMapPoint;
  point?: BMapPoint;
  pixel?: BMapPixel;
  overlay?: unknown;
  size?: BMapSize;
};

export type BMapViewportOptions = {
  noAnimation?: boolean;
  margins?: [number, number, number, number] | number[];
  zoomFactor?: number;
  delay?: number;
};

export type BMapDisplayOptions = {
  poi?: boolean;
  poiText?: boolean;
  poiIcon?: boolean;
  overlay?: boolean;
  building?: boolean;
  indoor?: boolean;
  street?: boolean;
  skyColor?: string[];
};

type BMapEventHandler = (event: BMapEvent) => void;

export type BMapOverlay = {
  addEventListener?(type: string, handler: BMapEventHandler): void;
  removeEventListener?(type: string, handler: BMapEventHandler): void;
  show?(): void;
  hide?(): void;
  setZIndex?(zIndex: number): void;
};

export type BMapMap = {
  centerAndZoom(center: BMapPoint | string, zoom: number): void;
  enableScrollWheelZoom(): void;
  disableScrollWheelZoom?(): void;
  enableResizeOnCenter?(): void;
  setDisplayOptions(options: BMapDisplayOptions | { option: BMapDisplayOptions }): void;
  setMaxZoom(zoom: number): void;
  setMinZoom?(zoom: number): void;
  getZoom(): number;
  setViewport(view: BMapPoint[], options?: BMapViewportOptions): void;
  getBounds(): BMapBounds;
  pointToPixel(point: BMapPoint): BMapPixel;
  pointToOverlayPixel(point: BMapPoint): BMapPixel;
  panTo(center: BMapPoint, options?: { noAnimation?: boolean }): void;
  flyTo?(center: BMapPoint, zoom: number): void;
  addOverlay(overlay: BMapOverlay): void;
  removeOverlay(overlay: BMapOverlay): void;
  clearOverlays(): void;
  getContainer(): HTMLElement;
  addEventListener(type: string, handler: BMapEventHandler): void;
  removeEventListener(type: string, handler: BMapEventHandler): void;
  setMapStyle?(options: { style?: string; styleJson?: object; version?: string }): void;
  setMapStyleV2?(options: { styleId?: string; styleJson?: object; version?: string }): void;
  destroy?(): void;
};

export type BMapIcon = {
  setImageUrl?(url: string): void;
};

export type BMapMarker = BMapOverlay & {
  setPosition(point: BMapPoint): void;
  getPosition(): BMapPoint;
  setIcon(icon: BMapIcon): void;
  enableDragging(): void;
};

export type BMapCustomOverlay = BMapOverlay & {
  setPoint(point: BMapPoint, noReCreate?: boolean): void;
  getPoint(): BMapPoint;
  setProperties?(properties: unknown): void;
  getProperties?(): unknown;
};

export type BMapMarkerOptions = {
  offset?: BMapSize;
  icon?: BMapIcon;
  enableMassClear?: boolean;
  enableDragging?: boolean;
  enableClicking?: boolean;
  raiseOnDrag?: boolean;
  draggingCursor?: string;
  rotation?: number;
  title?: string;
};

export type BMapIconOptions = {
  anchor?: BMapSize;
  imageOffset?: BMapSize;
};

export type BMapCustomOverlayOptions = {
  point?: BMapPoint;
  anchors?: [number, number];
  offsetX?: number;
  offsetY?: number;
  rotation?: number;
  rotationInit?: number;
  minZoom?: number;
  maxZoom?: number;
  properties?: unknown;
  fixBottom?: boolean;
  useTranslate?: boolean;
  autoFollowHeadingChanged?: boolean;
  visible?: boolean;
};

export type BMapGLNamespace = {
  Map: new (
    container: string | HTMLElement,
    options?: {
      minZoom?: number;
      maxZoom?: number;
      enableAutoResize?: boolean;
      enableTilt?: boolean;
      enableRotate?: boolean;
      enableRotateGestures?: boolean;
      enableTiltGestures?: boolean;
      overlayTop?: boolean;
      fixCenterWhenPinch?: boolean;
      enableAdaptiveMinZoom?: boolean;
      displayOptions?: BMapDisplayOptions;
    }
  ) => BMapMap;
  Point: new (lng: number, lat: number) => BMapPoint;
  Size: new (width: number, height: number) => BMapSize;
  Bounds: new (southWest: BMapPoint, northEast: BMapPoint) => BMapBounds;
  Marker: new (point: BMapPoint, options?: BMapMarkerOptions) => BMapMarker;
  Icon: new (url: string, size: BMapSize, options?: BMapIconOptions) => BMapIcon;
  CustomOverlay: new (
    domCreate: () => HTMLElement,
    options?: BMapCustomOverlayOptions
  ) => BMapCustomOverlay;
};

const PI = Math.PI;
const X_PI = (PI * 3000.0) / 180.0;
const A = 6378245.0;
const EE = 0.00669342162296594323;
const BAIDU_API_URL = "https://api.map.baidu.com/api?type=webgl&v=1.0";
const BAIDU_SCRIPT_SELECTOR = "script[data-ffm-baidu-map-api='true']";
const BAIDU_MAP_CALLBACK = "__FFM_BAIDU_MAP_READY__";
const BAIDU_MAP_TIMEOUT_MS = 15000;

type GlobalWithBaiduMap = typeof globalThis & {
  BMapGL?: BMapGLNamespace;
  __FFM_BAIDU_MAP_PROMISE__?: Promise<BMapGLNamespace>;
  [BAIDU_MAP_CALLBACK]?: () => void;
};

function outOfChina(lng: number, lat: number) {
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(lng: number, lat: number) {
  let ret =
    -100.0 +
    2.0 * lng +
    3.0 * lat +
    0.2 * lat * lat +
    0.1 * lng * lat +
    0.2 * Math.sqrt(Math.abs(lng));
  ret +=
    ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(lat * PI) + 40.0 * Math.sin((lat / 3.0) * PI)) * 2.0) /
    3.0;
  ret +=
    ((160.0 * Math.sin((lat / 12.0) * PI) + 320.0 * Math.sin((lat * PI) / 30.0)) * 2.0) /
    3.0;
  return ret;
}

function transformLng(lng: number, lat: number) {
  let ret =
    300.0 +
    lng +
    2.0 * lat +
    0.1 * lng * lng +
    0.1 * lng * lat +
    0.1 * Math.sqrt(Math.abs(lng));
  ret +=
    ((20.0 * Math.sin(6.0 * lng * PI) + 20.0 * Math.sin(2.0 * lng * PI)) * 2.0) /
    3.0;
  ret +=
    ((20.0 * Math.sin(lng * PI) + 40.0 * Math.sin((lng / 3.0) * PI)) * 2.0) /
    3.0;
  ret +=
    ((150.0 * Math.sin((lng / 12.0) * PI) + 300.0 * Math.sin((lng / 30.0) * PI)) * 2.0) /
    3.0;
  return ret;
}

export function roundCoordinates([lng, lat]: Coordinates, digits = 8): Coordinates {
  const precision = 10 ** digits;
  return [Math.round(lng * precision) / precision, Math.round(lat * precision) / precision];
}

export function wgs84ToGcj02(lng: number, lat: number): Coordinates {
  if (outOfChina(lng, lat)) return [lng, lat];

  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);
  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);
  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);
  return [lng + dLng, lat + dLat];
}

export function gcj02ToBd09(lng: number, lat: number): Coordinates {
  const z = Math.sqrt(lng * lng + lat * lat) + 0.00002 * Math.sin(lat * X_PI);
  const theta = Math.atan2(lat, lng) + 0.000003 * Math.cos(lng * X_PI);
  return [z * Math.cos(theta) + 0.0065, z * Math.sin(theta) + 0.006];
}

export function wgs84ToBd09(lng: number, lat: number): Coordinates {
  const [gcjLng, gcjLat] = wgs84ToGcj02(lng, lat);
  return gcj02ToBd09(gcjLng, gcjLat);
}

export function createBMapPoint(BMapGL: BMapGLNamespace, [lng, lat]: Coordinates): BMapPoint {
  return new BMapGL.Point(lng, lat);
}

export function getBaiduMapAk() {
  return (import.meta.env.VITE_BAIDU_MAP_AK ?? "").trim();
}

export function getBaiduMapMissingAkMessage() {
  return "请在 fzu-food-map/.env.local 中填写 VITE_BAIDU_MAP_AK 后重新启动。";
}

export function applyBaiduMapTheme(map: BMapMap, theme: "light" | "dark") {
  const style = theme === "dark" ? "midnight" : "normal";

  try {
    map.setMapStyle?.({ style });
    return;
  } catch {
    // Ignore and try the v2 API below.
  }

  try {
    map.setMapStyleV2?.({
      styleJson: theme === "dark" ? DARK_STYLE_JSON : LIGHT_STYLE_JSON,
      version: "v2"
    });
  } catch {
    // Ignore style failures and keep the default base map.
  }
}

export function loadBaiduMapApi(ak: string) {
  const globalWithBaiduMap = globalThis as GlobalWithBaiduMap;

  if (!ak.trim()) {
    return Promise.reject(new Error(getBaiduMapMissingAkMessage()));
  }

  if (globalWithBaiduMap.BMapGL) {
    return Promise.resolve(globalWithBaiduMap.BMapGL);
  }

  if (globalWithBaiduMap.__FFM_BAIDU_MAP_PROMISE__) {
    return globalWithBaiduMap.__FFM_BAIDU_MAP_PROMISE__;
  }

  globalWithBaiduMap.__FFM_BAIDU_MAP_PROMISE__ = new Promise<BMapGLNamespace>((resolve, reject) => {
    const existingScript = document.querySelector<HTMLScriptElement>(BAIDU_SCRIPT_SELECTOR);
    let timeoutId = 0;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      delete globalWithBaiduMap[BAIDU_MAP_CALLBACK];
    };

    const resolveIfReady = () => {
      if (!globalWithBaiduMap.BMapGL) {
        return false;
      }
      cleanup();
      resolve(globalWithBaiduMap.BMapGL);
      return true;
    };

    const handleFailure = (message?: string) => {
      cleanup();
      globalWithBaiduMap.__FFM_BAIDU_MAP_PROMISE__ = undefined;
      reject(new Error(message ?? "百度地图脚本加载失败，请检查 AK、白名单和当前来源域名。"));
    };

    if (resolveIfReady()) {
      return;
    }

    globalWithBaiduMap[BAIDU_MAP_CALLBACK] = () => {
      if (!resolveIfReady()) {
        handleFailure("百度地图回调已触发，但 BMapGL 未初始化完成。");
      }
    };

    timeoutId = window.setTimeout(() => {
      handleFailure("百度地图脚本加载超时，请检查 AK、Referer 白名单和网络连通性。");
    }, BAIDU_MAP_TIMEOUT_MS);

    if (existingScript) {
      existingScript.addEventListener(
        "error",
        () => handleFailure("百度地图脚本加载失败，请检查 AK、白名单和当前来源域名。"),
        { once: true }
      );
      return;
    }

    const script = document.createElement("script");
    script.src = `${BAIDU_API_URL}&ak=${encodeURIComponent(ak)}&callback=${BAIDU_MAP_CALLBACK}`;
    script.async = true;
    script.defer = true;
    script.dataset.ffmBaiduMapApi = "true";
    script.addEventListener(
      "error",
      () => handleFailure("百度地图脚本加载失败，请检查 AK、白名单和当前来源域名。"),
      { once: true }
    );
    document.head.appendChild(script);
  });

  return globalWithBaiduMap.__FFM_BAIDU_MAP_PROMISE__;
}

const LIGHT_STYLE_JSON = [
  {
    featureType: "building",
    elementType: "all",
    stylers: {
      visibility: "off"
    }
  }
];

const DARK_STYLE_JSON = [
  {
    featureType: "water",
    elementType: "all",
    stylers: {
      color: "#091934"
    }
  },
  {
    featureType: "land",
    elementType: "all",
    stylers: {
      color: "#09111f"
    }
  },
  {
    featureType: "boundary",
    elementType: "all",
    stylers: {
      color: "#1c2f4d"
    }
  },
  {
    featureType: "railway",
    elementType: "all",
    stylers: {
      visibility: "off"
    }
  },
  {
    featureType: "highway",
    elementType: "geometry",
    stylers: {
      color: "#1a2d49"
    }
  },
  {
    featureType: "highway",
    elementType: "geometry.fill",
    stylers: {
      color: "#12243d"
    }
  },
  {
    featureType: "highway",
    elementType: "labels.text.fill",
    stylers: {
      color: "#9fb5d9"
    }
  },
  {
    featureType: "arterial",
    elementType: "geometry",
    stylers: {
      color: "#13243b"
    }
  },
  {
    featureType: "arterial",
    elementType: "labels.text.fill",
    stylers: {
      color: "#96aac9"
    }
  },
  {
    featureType: "local",
    elementType: "geometry",
    stylers: {
      color: "#0e1a2d"
    }
  },
  {
    featureType: "local",
    elementType: "labels.text.fill",
    stylers: {
      color: "#859ab9"
    }
  },
  {
    featureType: "subway",
    elementType: "all",
    stylers: {
      visibility: "off"
    }
  },
  {
    featureType: "green",
    elementType: "geometry",
    stylers: {
      color: "#0d2a1f"
    }
  },
  {
    featureType: "manmade",
    elementType: "geometry",
    stylers: {
      color: "#111f34"
    }
  },
  {
    featureType: "poi",
    elementType: "all",
    stylers: {
      visibility: "off"
    }
  },
  {
    featureType: "label",
    elementType: "labels.text.fill",
    stylers: {
      color: "#9db2d5"
    }
  },
  {
    featureType: "label",
    elementType: "labels.text.stroke",
    stylers: {
      color: "#0b1424"
    }
  }
];
