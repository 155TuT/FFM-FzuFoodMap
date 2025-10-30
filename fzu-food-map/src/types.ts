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