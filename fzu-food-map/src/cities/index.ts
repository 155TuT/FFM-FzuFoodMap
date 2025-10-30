export type PoiProps = {
  id: string;
  name: string;
  tags?: string[];
  rating?: number;
  price?: string;
  url?: string;
  notes?: string;
};
export type GeoFeature = {
  type: "Feature";
  properties: PoiProps;
  geometry: { type: "Point"; coordinates: [number, number] };
};
export type GeoJson = { type: "FeatureCollection"; features: GeoFeature[]; };
// src/cities/index.ts
export type CityConfig = {
  slug: string;
  name: string;
  center: [number, number];
  zoom: number;
  dataPath: string;
  theme: { primary: string; danger: string; warning: string };
};

import fuzhou from "./fuzhou.config";

export const CITIES: CityConfig[] = [fuzhou];
export const DEFAULT_CITY = CITIES[0];

export function getCityBySlug(slug?: string) {
  return CITIES.find(c => c.slug === slug) ?? DEFAULT_CITY;
}