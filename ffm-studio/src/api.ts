import type { FilePayload, FileUpdateResponse, GeoJsonDocument, TaxonomyEntryKind, Workspace } from "./types";

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    headers: {
      "Content-Type": "application/json"
    },
    ...init
  });

  const payload = (await response.json()) as T & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? "请求失败");
  }
  return payload;
}

export function fetchWorkspace() {
  return request<Workspace>("/api/workspace");
}

export function fetchFile(filePath: string) {
  const query = new URLSearchParams({ path: filePath }).toString();
  return request<FilePayload>(`/api/file?${query}`);
}

export function updateCacheFile(filePath: string, data: GeoJsonDocument) {
  return request<FileUpdateResponse>("/api/file", {
    method: "PUT",
    body: JSON.stringify({ path: filePath, data })
  });
}

export function updateTaxonomyEntry(kind: TaxonomyEntryKind, value: string) {
  return request<Workspace>("/api/taxonomy", {
    method: "PUT",
    body: JSON.stringify({ kind, value })
  });
}

export function createFolder(parentPath: string, name: string) {
  return request<Workspace>("/api/folders", {
    method: "POST",
    body: JSON.stringify({ parentPath, name })
  });
}

export function deleteFolder(path: string) {
  const query = new URLSearchParams({ path }).toString();
  return request<Workspace>(`/api/folders?${query}`, {
    method: "DELETE"
  });
}

export function createGeoJsonFile(parentPath: string, name: string) {
  return request<{ path: string; file: FilePayload; workspace: Workspace }>("/api/files", {
    method: "POST",
    body: JSON.stringify({ parentPath, name })
  });
}

export function deleteGeoJsonFile(path: string) {
  const query = new URLSearchParams({ path }).toString();
  return request<Workspace>(`/api/files?${query}`, {
    method: "DELETE"
  });
}

export function saveAllGeoJsonFiles() {
  return request<Workspace>("/api/save-all", {
    method: "POST",
    body: JSON.stringify({})
  });
}

export function searchSourceCandidates(keyword: string) {
  return request<{ message?: string }>("/api/source-search", {
    method: "POST",
    body: JSON.stringify({ keyword })
  });
}
