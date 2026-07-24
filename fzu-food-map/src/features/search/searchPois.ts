import Fuse, { type FuseOptionKey, type FuseResult } from "fuse.js";
import type { GeoFeature, PoiProps, SearchField } from "../../types";
import { getIncludeEntries } from "../pois/poiDetails";

const SEARCH_KEYS: Record<SearchField, FuseOptionKey<GeoFeature>[]> = {
  name: [
    { name: "properties.name", weight: 1 },
    { name: "properties.include.name", weight: 0.8 }
  ],
  tags: [{ name: "properties.tags", weight: 1 }],
  notes: [
    { name: "properties.notes", weight: 1 },
    { name: "properties.include.notes", weight: 0.8 }
  ]
};

const SCORE_EPSILON = 0.015;

function ratingValue(feature: GeoFeature) {
  return feature.properties.rating ?? -Infinity;
}

function compareResults(a: FuseResult<GeoFeature>, b: FuseResult<GeoFeature>) {
  const scoreDelta = (a.score ?? 1) - (b.score ?? 1);
  if (Math.abs(scoreDelta) > SCORE_EPSILON) return scoreDelta;
  return ratingValue(b.item) - ratingValue(a.item);
}

export function searchPois(features: GeoFeature[], query: string, field: SearchField) {
  const term = query.trim();
  if (!term) return [];

  const fuse = new Fuse(features, {
    keys: SEARCH_KEYS[field],
    includeScore: true,
    ignoreLocation: true,
    minMatchCharLength: 1,
    shouldSort: true,
    threshold: 0.35
  });

  return fuse.search(term).sort(compareResults).map(result => result.item);
}

export function findMatchingIncludeIndex(poi: PoiProps, field: SearchField, query: string): number | null {
  if (field === "tags") return null;

  const entries = getIncludeEntries(poi);
  const term = query.trim();
  if (!entries.length || !term) return null;

  const fuse = new Fuse(entries, {
    keys: [field],
    includeScore: true,
    ignoreLocation: true,
    threshold: 0.35
  });
  return fuse.search(term)[0]?.refIndex ?? null;
}
