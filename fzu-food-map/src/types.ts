export type PoiCategory = "门店" | "食堂" | "摊位";

export type PoiProps = {
  id: string;
  category: PoiCategory;
  name: string;
  tags?: string[];
  rating?: number;
  price?: string;
  url?: string;
  notes?: string;
  include?: {
    id?: string[];
    name?: string[];
    notes?: string[];
  };
  address?: string;
  contact?: string;
  openhour?: string;
};

export type GeoFeature = {
  type: "Feature";
  properties: PoiProps;
  geometry: { type: "Point"; coordinates: [number, number] };
};

export type GeoJson = { type: "FeatureCollection"; features: GeoFeature[] };

export type SearchField = "name" | "tags" | "notes";
