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
  tags?: string[];
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
};

export type WorkspaceNode = WorkspaceDirectoryNode | WorkspaceFileNode;

export type Workspace = {
  sourceRoot: string;
  cacheRoot: string;
  tree: WorkspaceDirectoryNode;
  taxonomy: {
    categories: string[];
    tags: string[];
  };
};

export type FilePayload = {
  path: string;
  dirty: boolean;
  data: GeoJsonDocument;
  sourceData: GeoJsonDocument | null;
};

export type FileUpdateResponse = {
  file: FilePayload;
  workspace: Workspace;
};
