import type { PoiProps, PoiSource, PoiSourceStatus } from "../types";

const DISPLAYABLE_SOURCE_STATUSES = new Set<PoiSourceStatus>(["confirmed", "manual"]);
const MANUAL_SOURCE_TITLE = "\u624b\u52a8\u5f55\u5165";

const PLATFORM_PLACEHOLDER_MAP: Record<string, string> = {
  dianping: "DI",
  xiaohongshu: "XH",
  douyin: "DY",
  bilibili: "BI",
  meituan: "MT",
  taobao_flash: "TF",
  jd_takeaway: "JD",
  amap: "AM",
  baidu_map: "BD",
  apple_maps: "AP",
  google_maps: "GO",
  manual: "MA"
};

export type NormalizedPoiSource = {
  key: string;
  platform: string;
  title: string;
  pageUrl?: string;
  searchUrl?: string;
  appUrl?: string;
  status: PoiSourceStatus | string;
  linkUrl?: string;
  placeholder: string;
  clickable: boolean;
};

export function getPlatformPlaceholder(platform: string) {
  const normalized = platform.trim().toLowerCase();
  const mapped = PLATFORM_PLACEHOLDER_MAP[normalized];
  if (mapped) {
    return mapped;
  }

  const fallback = normalized.replace(/[^a-z0-9]/g, "") || normalized || "??";
  return fallback.slice(0, 2).toUpperCase().padEnd(2, fallback[0]?.toUpperCase() ?? "?");
}

export function getPreferredSourceUrl(source: Pick<PoiSource, "appUrl" | "pageUrl" | "searchUrl">) {
  return (
    normalizeOptionalString(source.appUrl) ??
    normalizeOptionalString(source.pageUrl) ??
    normalizeOptionalString(source.searchUrl)
  );
}

export function getDisplaySources(poi: PoiProps): NormalizedPoiSource[] {
  const rawSources = Array.isArray(poi.sources) ? poi.sources : null;
  const legacySourcePlatform = normalizeOptionalString(poi.source);
  const legacyUrl = normalizeOptionalString(poi.url);

  if (rawSources && rawSources.length > 0) {
    return rawSources
      .map((source, index) => normalizeSource(source, index))
      .filter((source): source is NormalizedPoiSource => {
        if (!source) {
          return false;
        }
        return DISPLAYABLE_SOURCE_STATUSES.has(source.status as PoiSourceStatus);
      });
  }

  if (legacySourcePlatform) {
    const normalizedPlatform = legacySourcePlatform.toLowerCase();
    const fallbackSource = normalizeSource(
      {
        platform: normalizedPlatform,
        title: normalizedPlatform === "manual" ? MANUAL_SOURCE_TITLE : legacySourcePlatform,
        pageUrl: legacyUrl,
        status: normalizedPlatform === "manual" ? "manual" : "confirmed"
      },
      0
    );

    return fallbackSource ? [fallbackSource] : [];
  }

  if (!legacyUrl) {
    return [];
  }

  const fallbackSource = normalizeSource(
    {
      platform: "manual",
      title: MANUAL_SOURCE_TITLE,
      pageUrl: legacyUrl,
      status: "manual"
    },
    0
  );

  return fallbackSource ? [fallbackSource] : [];
}

function normalizeSource(source: PoiSource, index: number): NormalizedPoiSource | null {
  if (!source || typeof source !== "object") {
    return null;
  }

  const platform = normalizeOptionalString(source.platform) ?? "source";
  const title = normalizeOptionalString(source.title) ?? platform;
  const pageUrl = normalizeOptionalString(source.pageUrl);
  const searchUrl = normalizeOptionalString(source.searchUrl);
  const appUrl = normalizeOptionalString(source.appUrl);
  const status = (normalizeOptionalString(source.status)?.toLowerCase() ?? "confirmed") as PoiSourceStatus | string;
  const linkUrl = getPreferredSourceUrl({ appUrl, pageUrl, searchUrl });

  return {
    key: `${platform}-${title}-${index}`,
    platform,
    title,
    pageUrl,
    searchUrl,
    appUrl,
    status,
    linkUrl,
    placeholder: getPlatformPlaceholder(platform),
    clickable: Boolean(linkUrl)
  };
}

function normalizeOptionalString(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}
