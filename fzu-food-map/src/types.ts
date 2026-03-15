export type PoiCategory = "\u95e8\u5e97" | "\u98df\u5802" | "\u644a\u4f4d";

export type PoiSourceStatus = "confirmed" | "candidate" | "manual" | "needs_review";

export type PoiSource = {
  platform?: string;
  title?: string;
  pageUrl?: string;
  searchUrl?: string;
  appUrl?: string;
  status?: PoiSourceStatus | string;
};

export type PoiProps = {
  id: string;
  category: PoiCategory;
  name: string;
  regionId?: string;
  source?: string;
  tags?: string[];
  rating?: number;
  price?: string;
  url?: string;
  notes?: string;
  sources?: PoiSource[];
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
