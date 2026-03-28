import fs from "node:fs/promises";
import fssync from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = fileURLToPath(new URL(".", import.meta.url));
const studioRoot = path.resolve(serverRoot, "..");
const sourceRoot = path.resolve(studioRoot, "../fzu-food-map/public/data");
const cacheStateRoot = path.resolve(studioRoot, ".cache");
const cacheRoot = path.resolve(studioRoot, ".cache/data");
const cacheInitMarker = path.resolve(cacheStateRoot, ".initialized");
const taxonomyCachePath = path.resolve(cacheStateRoot, "taxonomy.json");
const port = Number(process.env.FFM_STUDIO_API_PORT ?? 4173);
const DEFAULT_CATEGORY = "门店";

let taxonomyBootstrapped = false;

const CATEGORY_ALIASES = new Map([
  ["小摊", "摊位"],
  ["摊位", "摊位"]
]);

function normalizeSeparators(value) {
  return value.replace(/\\/g, "/");
}

function validateName(name, label) {
  const trimmed = name.trim();
  if (!trimmed) {
    throw new Error(`${label}不能为空`);
  }
  if (trimmed.includes("/") || trimmed.includes("\\") || trimmed.includes("..")) {
    throw new Error(`${label}不允许包含路径分隔符`);
  }
  return trimmed;
}

function resolveCachePath(relativePath = "") {
  const normalized = normalizeSeparators(relativePath).replace(/^\/+/, "");
  const absolute = path.resolve(cacheRoot, normalized);
  if (!absolute.startsWith(cacheRoot)) {
    throw new Error("非法路径");
  }
  return absolute;
}

function resolveSourcePath(relativePath = "") {
  const normalized = normalizeSeparators(relativePath).replace(/^\/+/, "");
  const absolute = path.resolve(sourceRoot, normalized);
  if (!absolute.startsWith(sourceRoot)) {
    throw new Error("非法路径");
  }
  return absolute;
}

async function ensureDirectory(targetPath) {
  await fs.mkdir(targetPath, { recursive: true });
}

function sanitizeFeature(feature) {
  if (!feature || typeof feature !== "object") {
    return feature;
  }
  const properties =
    feature.properties && typeof feature.properties === "object" && !Array.isArray(feature.properties)
      ? feature.properties
      : {};
  const { regionId, ...restProperties } = properties;
  return {
    ...feature,
    properties: restProperties
  };
}

function sanitizeGeoJsonDocument(data) {
  if (!data || typeof data !== "object") {
    return data;
  }
  return {
    ...data,
    features: Array.isArray(data.features) ? data.features.map(sanitizeFeature) : []
  };
}

function sortZh(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

function normalizeCategoryValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }
  return CATEGORY_ALIASES.get(trimmed) ?? trimmed;
}

function normalizeTagValue(value) {
  if (typeof value !== "string") {
    return "";
  }
  return value.trim();
}

function normalizeStringList(values, normalizeValue) {
  return sortZh([...new Set(values.map(normalizeValue).filter(Boolean))]);
}

function normalizeTaxonomy(taxonomy = {}) {
  return {
    categories: normalizeStringList(
      [DEFAULT_CATEGORY, ...(Array.isArray(taxonomy.categories) ? taxonomy.categories : [])],
      normalizeCategoryValue
    ),
    tags: normalizeStringList(Array.isArray(taxonomy.tags) ? taxonomy.tags : [], normalizeTagValue)
  };
}

function createEmptyTaxonomy() {
  return normalizeTaxonomy();
}

function normalizeComparableValue(value) {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "number" ||
    typeof value === "string"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => normalizeComparableValue(item));
  }

  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return Object.fromEntries(entries.map(([key, item]) => [key, normalizeComparableValue(item)]));
  }

  return null;
}

function stableSerialize(value) {
  return JSON.stringify(normalizeComparableValue(value));
}

async function readRawJsonFile(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function copyGeoJsonTree(sourcePath, targetPath, skipExisting = false) {
  const stat = await fs.stat(sourcePath);
  if (stat.isDirectory()) {
    await ensureDirectory(targetPath);
    const entries = await fs.readdir(sourcePath, { withFileTypes: true });
    for (const entry of entries) {
      await copyGeoJsonTree(path.join(sourcePath, entry.name), path.join(targetPath, entry.name), skipExisting);
    }
    return;
  }

  if (!sourcePath.endsWith(".geojson")) {
    return;
  }

  if (skipExisting && fssync.existsSync(targetPath)) {
    return;
  }

  await writeJsonFile(targetPath, await readJsonFile(sourcePath));
}

async function ensureCacheInitialized() {
  await ensureDirectory(cacheStateRoot);
  await ensureDirectory(cacheRoot);
  if (!fssync.existsSync(cacheInitMarker)) {
    const entries = await fs.readdir(cacheRoot, { withFileTypes: true });
    if (entries.length === 0 && fssync.existsSync(sourceRoot)) {
      await copyGeoJsonTree(sourceRoot, cacheRoot, true);
    }

    await fs.writeFile(cacheInitMarker, `${new Date().toISOString()}\n`, "utf8");
  }

  if (!taxonomyBootstrapped) {
    await syncTaxonomyCache();
    taxonomyBootstrapped = true;
  }
}

async function readJsonFile(filePath) {
  return sanitizeGeoJsonDocument(await readRawJsonFile(filePath));
}

async function writeJsonFile(filePath, data) {
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(sanitizeGeoJsonDocument(data), null, 2)}\n`, "utf8");
}

async function writeRawJsonFile(filePath, data) {
  await ensureDirectory(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function isFileDirty(relativePath) {
  const cachePath = resolveCachePath(relativePath);
  const sourcePath = resolveSourcePath(relativePath);

  if (!fssync.existsSync(cachePath)) return false;
  if (!fssync.existsSync(sourcePath)) return true;

  const [cacheContent, sourceContent] = await Promise.all([
    readJsonFile(cachePath),
    readJsonFile(sourcePath)
  ]);
  return stableSerialize(cacheContent) !== stableSerialize(sourceContent);
}

function createEmptyGeoJson(name) {
  return {
    type: "FeatureCollection",
    license: "CC BY-NC 4.0",
    _notes: `${name.replace(/\.geojson$/i, "")} 点位`,
    features: []
  };
}

async function listTree(dirPath = cacheRoot, relativePath = "") {
  const entries = await fs.readdir(dirPath, { withFileTypes: true });
  const children = [];

  for (const entry of entries.sort((left, right) => {
    if (left.isDirectory() && !right.isDirectory()) return -1;
    if (!left.isDirectory() && right.isDirectory()) return 1;
    return left.name.localeCompare(right.name, "zh-CN");
  })) {
    const absolute = path.join(dirPath, entry.name);
    const childPath = normalizeSeparators(path.join(relativePath, entry.name));

    if (entry.isDirectory()) {
      children.push({
        type: "directory",
        name: entry.name,
        path: childPath,
        children: await listTree(absolute, childPath)
      });
      continue;
    }

    if (!entry.name.endsWith(".geojson")) {
      continue;
    }

    let featureCount = 0;
    try {
      const content = await readJsonFile(absolute);
      featureCount = Array.isArray(content.features) ? content.features.length : 0;
    } catch {
      featureCount = 0;
    }

    children.push({
      type: "file",
      name: entry.name,
      path: childPath,
      featureCount,
      dirty: await isFileDirty(childPath)
    });
  }

  return children;
}

function collectFeatureTaxonomy(feature, categories, tags) {
  const category = normalizeCategoryValue(feature?.properties?.category);
  if (category) {
    categories.add(category);
  }

  const rawTags = Array.isArray(feature?.properties?.tags) ? feature.properties.tags : [];
  for (const tag of rawTags) {
    const normalizedTag = normalizeTagValue(tag);
    if (normalizedTag) {
      tags.add(normalizedTag);
    }
  }
}

function collectDocumentTaxonomy(document) {
  const categories = new Set([DEFAULT_CATEGORY]);
  const tags = new Set();

  for (const feature of document?.features ?? []) {
    collectFeatureTaxonomy(feature, categories, tags);
  }

  return normalizeTaxonomy({
    categories: [...categories],
    tags: [...tags]
  });
}

async function walkGeoJsonFiles(rootPath, visitor, relativePath = "") {
  if (!fssync.existsSync(rootPath)) {
    return;
  }

  const entries = await fs.readdir(rootPath, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(rootPath, entry.name);
    const childRelativePath = normalizeSeparators(path.join(relativePath, entry.name));

    if (entry.isDirectory()) {
      await walkGeoJsonFiles(absolutePath, visitor, childRelativePath);
      continue;
    }

    if (!entry.name.endsWith(".geojson")) {
      continue;
    }

    await visitor({ absolutePath, relativePath: childRelativePath });
  }
}

async function readTaxonomyCache() {
  if (!fssync.existsSync(taxonomyCachePath)) {
    return createEmptyTaxonomy();
  }

  try {
    return normalizeTaxonomy(await readRawJsonFile(taxonomyCachePath));
  } catch {
    return createEmptyTaxonomy();
  }
}

async function writeTaxonomyCache(taxonomy) {
  const normalized = normalizeTaxonomy(taxonomy);
  await writeRawJsonFile(taxonomyCachePath, normalized);
  return normalized;
}

async function mergeTaxonomyCache(partial) {
  const current = await readTaxonomyCache();
  return writeTaxonomyCache({
    categories: [...current.categories, ...(partial?.categories ?? [])],
    tags: [...current.tags, ...(partial?.tags ?? [])]
  });
}

async function collectTaxonomyFromCache() {
  const categories = new Set([DEFAULT_CATEGORY]);
  const tags = new Set();

  await walkGeoJsonFiles(cacheRoot, async ({ absolutePath }) => {
    try {
      const content = await readJsonFile(absolutePath);
      const taxonomy = collectDocumentTaxonomy(content);
      for (const category of taxonomy.categories) {
        categories.add(category);
      }
      for (const tag of taxonomy.tags) {
        tags.add(tag);
      }
    } catch {
      return;
    }
  });

  return normalizeTaxonomy({
    categories: [...categories],
    tags: [...tags]
  });
}

async function syncTaxonomyCache() {
  return mergeTaxonomyCache(await collectTaxonomyFromCache());
}

async function upsertTaxonomyEntry(kind, value) {
  const normalizedValue = kind === "category" ? normalizeCategoryValue(value) : normalizeTagValue(value);
  if (!normalizedValue) {
    throw new Error(kind === "category" ? "缺少门店类型" : "缺少标签");
  }

  return mergeTaxonomyCache(kind === "category" ? { categories: [normalizedValue] } : { tags: [normalizedValue] });
}

async function buildWorkspace() {
  await ensureCacheInitialized();
  return {
    sourceRoot: normalizeSeparators(path.relative(studioRoot, sourceRoot)),
    cacheRoot: normalizeSeparators(path.relative(studioRoot, cacheRoot)),
    tree: {
      type: "directory",
      name: "data",
      path: "",
      children: await listTree()
    },
    taxonomy: await readTaxonomyCache()
  };
}

async function getFile(relativePath) {
  await ensureCacheInitialized();
  const cachePath = resolveCachePath(relativePath);
  const sourcePath = resolveSourcePath(relativePath);
  if (!fssync.existsSync(cachePath)) {
    throw new Error("文件不存在");
  }

  const data = await readJsonFile(cachePath);
  return {
    path: normalizeSeparators(relativePath),
    dirty: await isFileDirty(relativePath),
    data,
    sourceData: fssync.existsSync(sourcePath) ? await readJsonFile(sourcePath) : null
  };
}

async function updateCacheFile(relativePath, data) {
  await ensureCacheInitialized();
  const cachePath = resolveCachePath(relativePath);
  await writeJsonFile(cachePath, data);
  await mergeTaxonomyCache(collectDocumentTaxonomy(data));
  return {
    file: await getFile(relativePath),
    workspace: await buildWorkspace()
  };
}

async function createFolder(parentPath, name) {
  await ensureCacheInitialized();
  const safeName = validateName(name, "文件夹名");
  const directory = resolveCachePath(path.join(parentPath ?? "", safeName));
  await ensureDirectory(directory);
  return buildWorkspace();
}

async function createGeoJsonFile(parentPath, name) {
  await ensureCacheInitialized();
  const safeName = validateName(name, "文件名");
  const fileName = safeName.endsWith(".geojson") ? safeName : `${safeName}.geojson`;
  const relativePath = normalizeSeparators(path.join(parentPath ?? "", fileName));
  const cachePath = resolveCachePath(relativePath);

  if (fssync.existsSync(cachePath)) {
    throw new Error("GeoJSON 文件已存在");
  }

  await writeJsonFile(cachePath, createEmptyGeoJson(fileName));
  return {
    path: relativePath,
    workspace: await buildWorkspace(),
    file: await getFile(relativePath)
  };
}

async function deleteFolder(relativePath) {
  await ensureCacheInitialized();
  const normalizedPath = normalizeSeparators(relativePath ?? "").replace(/^\/+/, "");
  if (!normalizedPath) {
    throw new Error("不能删除根目录");
  }

  const cachePath = resolveCachePath(normalizedPath);
  if (!fssync.existsSync(cachePath)) {
    throw new Error("文件夹不存在");
  }

  const stat = await fs.stat(cachePath);
  if (!stat.isDirectory()) {
    throw new Error("目标不是文件夹");
  }

  await fs.rm(cachePath, { recursive: true, force: true });

  return buildWorkspace();
}

async function deleteGeoJsonFile(relativePath) {
  await ensureCacheInitialized();
  const normalizedPath = normalizeSeparators(relativePath ?? "").replace(/^\/+/, "");
  if (!normalizedPath.endsWith(".geojson")) {
    throw new Error("只能删除 GeoJSON 文件");
  }

  const cachePath = resolveCachePath(normalizedPath);
  if (!fssync.existsSync(cachePath)) {
    throw new Error("GeoJSON 文件不存在");
  }

  const stat = await fs.stat(cachePath);
  if (!stat.isFile()) {
    throw new Error("目标不是 GeoJSON 文件");
  }

  await fs.rm(cachePath, { force: true });

  return buildWorkspace();
}

async function overwriteSourceFromCache() {
  await ensureCacheInitialized();
  await fs.rm(sourceRoot, { recursive: true, force: true });
  await ensureDirectory(sourceRoot);
  if (fssync.existsSync(cacheRoot)) {
    await copyGeoJsonTree(cacheRoot, sourceRoot);
  }
}

async function saveFile(relativePath) {
  const cachePath = resolveCachePath(relativePath);

  if (!fssync.existsSync(cachePath)) {
    throw new Error("缓存文件不存在");
  }

  await overwriteSourceFromCache();

  return {
    file: await getFile(relativePath),
    workspace: await buildWorkspace()
  };
}

async function saveAllFiles() {
  await overwriteSourceFromCache();
  return buildWorkspace();
}

async function readBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  const raw = Buffer.concat(chunks).toString("utf8");
  return JSON.parse(raw);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendError(response, error) {
  const message = error instanceof Error ? error.message : "服务异常";
  sendJson(response, 400, { error: message });
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "127.0.0.1"}`);

  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (request.method === "OPTIONS") {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    if (request.method === "GET" && url.pathname === "/api/workspace") {
      sendJson(response, 200, await buildWorkspace());
      return;
    }

    if (request.method === "GET" && url.pathname === "/api/file") {
      const relativePath = url.searchParams.get("path");
      if (!relativePath) {
        throw new Error("缺少文件路径");
      }
      sendJson(response, 200, await getFile(relativePath));
      return;
    }

    if (request.method === "PUT" && url.pathname === "/api/file") {
      const body = await readBody(request);
      if (typeof body.path !== "string") {
        throw new Error("缺少文件路径");
      }
      if (!body.data || typeof body.data !== "object") {
        throw new Error("缺少 GeoJSON 数据");
      }
      sendJson(response, 200, await updateCacheFile(body.path, body.data));
      return;
    }

    if (request.method === "PUT" && url.pathname === "/api/taxonomy") {
      const body = await readBody(request);
      if (body.kind !== "category" && body.kind !== "tag") {
        throw new Error("缺少有效的 taxonomy 类型");
      }
      if (typeof body.value !== "string") {
        throw new Error("缺少 taxonomy 值");
      }
      await upsertTaxonomyEntry(body.kind, body.value);
      sendJson(response, 200, await buildWorkspace());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/folders") {
      const body = await readBody(request);
      sendJson(response, 200, await createFolder(body.parentPath ?? "", body.name ?? ""));
      return;
    }

    if (request.method === "DELETE" && url.pathname === "/api/folders") {
      const relativePath = url.searchParams.get("path");
      if (typeof relativePath !== "string") {
        throw new Error("缺少文件夹路径");
      }
      sendJson(response, 200, await deleteFolder(relativePath));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/files") {
      const body = await readBody(request);
      sendJson(response, 200, await createGeoJsonFile(body.parentPath ?? "", body.name ?? ""));
      return;
    }

    if (request.method === "DELETE" && url.pathname === "/api/files") {
      const relativePath = url.searchParams.get("path");
      if (typeof relativePath !== "string") {
        throw new Error("缺少文件路径");
      }
      sendJson(response, 200, await deleteGeoJsonFile(relativePath));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/save") {
      const body = await readBody(request);
      if (typeof body.path !== "string") {
        throw new Error("缺少文件路径");
      }
      sendJson(response, 200, await saveFile(body.path));
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/save-all") {
      sendJson(response, 200, await saveAllFiles());
      return;
    }

    if (request.method === "POST" && url.pathname === "/api/source-search") {
      sendJson(response, 501, {
        error: "来源搜索接口待实现",
        message: "这里预留给后续半自动来源搜索组件。"
      });
      return;
    }

    sendJson(response, 404, { error: "未找到接口" });
  } catch (error) {
    sendError(response, error);
  }
});

server.prependListener("error", error => {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "EADDRINUSE") {
      console.error(`FFM Studio API port ${port} is already in use.`);
      process.exit(1);
    }

    if (error.code === "EACCES") {
      console.error(`FFM Studio API cannot bind to 127.0.0.1:${port}. The port may be reserved or blocked by the OS.`);
      process.exit(1);
    }
  }
});

server.on("error", error => {
  if (error && typeof error === "object" && "code" in error && error.code === "EADDRINUSE") {
    console.error(`FFM Studio API 端口 ${port} 已被占用`);
    process.exit(1);
  }
  throw error;
});

server.listen(port, "127.0.0.1", () => {
  console.log(`FFM Studio API running at http://127.0.0.1:${port}`);
});
