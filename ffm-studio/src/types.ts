import type { TagGroupKey, TagGroups } from "./tagGroups";

export type PoiSource = {
  platform?: string;
  title?: string;
  pageUrl?: string;
  searchUrl?: string;
  appUrl?: string;
  status?: string;
};

export type PoiInclude = {
  id?: string[];
  name?: string[];
  notes?: string[];
};

export type PoiProperties = {
  id: string;
  category: string;
  name: string;
  source?: string;
  tags?: TagGroups;
  rating?: number;
  price?: string;
  notes?: string;
  address?: string;
  contact?: string;
  openhour?: string;
  include?: PoiInclude;
  sources?: PoiSource[];
  [key: string]: unknown;
};

export type GeoFeature = {
  type: "Feature";
  properties: PoiProperties;
  geometry: { type: "Point"; coordinates: [number, number] };
};

export type GeoJsonDocument = {
  type: "FeatureCollection";
  license?: string;
  _notes?: string;
  features: GeoFeature[];
  [key: string]: unknown;
};

export type WorkspaceDirectoryNode = {
  type: "directory";
  name: string;
  path: string;
  children: WorkspaceNode[];
};

export type WorkspaceFileNode = {
  type: "file";
  name: string;
  path: string;
  featureCount: number;
  dirty: boolean;
  regionDirty: boolean;
};

export type WorkspaceNode = WorkspaceDirectoryNode | WorkspaceFileNode;

export type Taxonomy = TagGroups & {
  categories: string[];
};

export type TaxonomyEntryKind = "category" | TagGroupKey;

export type Workspace = {
  sourceRoot: string;
  cacheRoot: string;
  regionCachePath: string;
  regionConfigDirty: boolean;
  tree: WorkspaceDirectoryNode;
  taxonomy: Taxonomy;
};

export type RegionConfig = {
  id: string;
  name: string;
  center: [number, number];
  zoom: number;
  isCitywide?: boolean;
  dataPath?: string;
};

export type FileRegionConfig = {
  configPath: string;
  data: RegionConfig;
  sourceData: RegionConfig | null;
  dirty: boolean;
  inferred: boolean;
};

export type FilePayload = {
  path: string;
  dirty: boolean;
  data: GeoJsonDocument;
  sourceData: GeoJsonDocument | null;
  regionConfig: FileRegionConfig | null;
};

export type FileUpdateResponse = {
  file: FilePayload;
  workspace: Workspace;
};
