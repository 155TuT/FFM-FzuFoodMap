import { useMemo } from "react";
import type { GeoFeature, SearchField } from "../../types";
import { searchPois } from "./searchPois";

export function usePoiSearch(features: GeoFeature[], query: string, field: SearchField) {
  return useMemo(() => searchPois(features, query, field), [features, field, query]);
}
