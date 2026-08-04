import fuzhou from "../../../fzu-food-map/src/cities/fuzhou.config";
import type {
  GeoFeature,
  GeoJsonDocument,
  PoiInclude,
  PoiSource,
  RegionConfig,
  TaxonomyEntryKind,
  Workspace
} from "../types";
import { basename } from "./workspaceTree";
import { createEmptyTagGroups, normalizeTagGroups } from "../tagGroups";

export const DEFAULT_CATEGORY = "门店";

export type IncludeRow = {
  name: string;
  notes: string;
};

const DEFAULT_COORDS: [number, number] = [119.29824947, 26.04783333];
const CATEGORY_ALIASES = new Map([["小摊", "摊位"]]);
const REGION_DEFAULT_COORDS = fuzhou.regions.reduce<Record<string, [number, number]>>(
  (acc, region) => {
    acc[region.id.toLowerCase()] = region.center;
    if (region.dataPath) {
      acc[basename(region.dataPath).replace(/\.geojson$/i, "").toLowerCase()] =
        region.center;
    }
    return acc;
  },
  {}
);

export function uniq(values: string[]) {
  return [...new Set(values.map(item => item.trim()).filter(Boolean))];
}

export function normalizeCategoryInput(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return DEFAULT_CATEGORY;
  }
  return CATEGORY_ALIASES.get(trimmed) ?? trimmed;
}

export function mergeTaxonomyEntry(
  taxonomy: Workspace["taxonomy"],
  kind: TaxonomyEntryKind,
  value: string
): Workspace["taxonomy"] {
  const key = kind === "category" ? "categories" : kind;
  return {
    ...taxonomy,
    [key]: uniq([...(taxonomy[key] ?? []), value])
  };
}

function featurePrefix(filePath: string) {
  return basename(filePath).replace(/\.geojson$/i, "").toLowerCase();
}

function formatFeatureId(filePath: string, index: number) {
  return `${featurePrefix(filePath)}-${String(index + 1).padStart(3, "0")}`;
}

export function renumberFeatures(filePath: string, features: GeoFeature[]) {
  return features.map((feature, index) => ({
    ...feature,
    properties: {
      ...feature.properties,
      id: formatFeatureId(filePath, index)
    }
  }));
}

function resolveDocumentCenter(
  document?: GeoJsonDocument | null
): [number, number] | null {
  if (!document) {
    return null;
  }

  const coordinates = document.features
    .map(feature => feature.geometry.coordinates)
    .filter(
      (point): point is [number, number] =>
        Number.isFinite(point[0]) && Number.isFinite(point[1])
    );

  if (!coordinates.length) {
    return null;
  }

  let minLng = coordinates[0][0];
  let maxLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLat = coordinates[0][1];

  for (const [lng, lat] of coordinates.slice(1)) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }

  return [
    Number(((minLng + maxLng) / 2).toFixed(8)),
    Number(((minLat + maxLat) / 2).toFixed(8))
  ];
}

export function getDefaultCoordsForFile(
  filePath: string,
  document?: GeoJsonDocument | null
): [number, number] {
  const fileKey = basename(filePath)
    .replace(/\.geojson$/i, "")
    .toLowerCase();
  const regionCenter = REGION_DEFAULT_COORDS[fileKey];
  if (regionCenter) {
    return [...regionCenter] as [number, number];
  }
  return resolveDocumentCenter(document) ?? DEFAULT_COORDS;
}

export function isRegionConfigDirty(
  data: RegionConfig,
  sourceData: RegionConfig | null
) {
  return JSON.stringify(data) !== JSON.stringify(sourceData);
}

export function buildFeature(
  categories: string[],
  coordinates: [number, number]
): GeoFeature {
  return {
    type: "Feature",
    properties: {
      id: "",
      category: categories[0] ?? DEFAULT_CATEGORY,
      name: "新建点位",
      source: "manual",
      tags: createEmptyTagGroups(),
      notes: "",
      address: "",
      contact: "",
      openhour: "",
      sources: [{ platform: "manual", title: "手动添加", status: "manual" }]
    },
    geometry: {
      type: "Point",
      coordinates: [...coordinates] as [number, number]
    }
  };
}

export function toIncludeRows(include?: PoiInclude): IncludeRow[] {
  const names = Array.isArray(include?.name) ? include.name : [];
  const notes = Array.isArray(include?.notes) ? include.notes : [];
  return names.map((name, index) => ({
    name: name ?? "",
    notes: notes[index] ?? ""
  }));
}

export function fromIncludeRows(rows: IncludeRow[]) {
  const cleaned = rows
    .map(row => ({ name: row.name.trim(), notes: row.notes.trim() }))
    .filter(row => row.name || row.notes);
  if (!cleaned.length) {
    return undefined;
  }
  return {
    name: cleaned.map(row => row.name),
    notes: cleaned.map(row => row.notes)
  };
}

function cleanSources(sources: PoiSource[]) {
  const cleaned = sources
    .map(source => ({
      platform: source.platform?.trim() || undefined,
      title: source.title?.trim() || undefined,
      pageUrl: source.pageUrl?.trim() || undefined,
      searchUrl: source.searchUrl?.trim() || undefined,
      appUrl: source.appUrl?.trim() || undefined,
      status: source.status?.trim() || undefined
    }))
    .filter(source => Object.values(source).some(Boolean));
  return cleaned.length ? cleaned : undefined;
}

export function normalizeFeature(feature: GeoFeature): GeoFeature {
  return {
    ...feature,
    properties: {
      ...feature.properties,
      category: feature.properties.category.trim() || DEFAULT_CATEGORY,
      name: feature.properties.name.trim() || "未命名点位",
      tags: normalizeTagGroups(feature.properties.tags),
      include: fromIncludeRows(toIncludeRows(feature.properties.include)),
      sources: cleanSources(feature.properties.sources ?? [])
    }
  };
}
