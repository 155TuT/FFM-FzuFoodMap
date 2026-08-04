import fs from "node:fs/promises";
import fssync from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const serverRoot = fileURLToPath(new URL(".", import.meta.url));
const studioRoot = path.resolve(serverRoot, "..");
const sourceRoot = path.resolve(studioRoot, "../fzu-food-map/public/data");
const cityConfigRoot = path.resolve(studioRoot, "../fzu-food-map/src/cities");
const cacheStateRoot = path.resolve(studioRoot, ".cache");
const cacheRoot = path.resolve(studioRoot, ".cache/data");
const cacheInitMarker = path.resolve(cacheStateRoot, ".initialized");
const taxonomyCachePath = path.resolve(cacheStateRoot, "taxonomy.json");
const regionCachePath = path.resolve(cacheStateRoot, "regions.json");
const port = Number(process.env.FFM_STUDIO_API_PORT ?? 4173);
const DEFAULT_CATEGORY = "门店";
const DEFAULT_REGION_ZOOM = 14;
const TAG_GROUP_KEYS = [
  "cuisines",
  "price_range",
  "characteristics",
  "dish",
  "miscellaneous"
];

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

function normalizeTagGroups(tags) {
  const source = tags && typeof tags === "object" && !Array.isArray(tags) ? tags : {};
  const legacyTags = Array.isArray(tags) ? tags : [];
  return Object.fromEntries(
    TAG_GROUP_KEYS.map(key => [
      key,
      normalizeStringList(
        key === "miscellaneous"
          ? [...(Array.isArray(source[key]) ? source[key] : []), ...legacyTags]
          : (Array.isArray(source[key]) ? source[key] : []),
        normalizeTagValue
      )
    ])
  );
}

function normalizeTaxonomy(taxonomy = {}) {
  return {
    categories: normalizeStringList(
      [DEFAULT_CATEGORY, ...(Array.isArray(taxonomy.categories) ? taxonomy.categories : [])],
      normalizeCategoryValue
    ),
    ...normalizeTagGroups(
      TAG_GROUP_KEYS.some(key => Array.isArray(taxonomy[key]))
        ? taxonomy
        : taxonomy.tags
    )
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

function decodeStringLiteral(value) {
  if (value.startsWith('"')) {
    return JSON.parse(value);
  }
  return value.slice(1, -1).replace(/\\(['\\])/g, "$1");
}

function readStringProperty(source, property) {
  const match = source.match(
    new RegExp(`\\b${property}\\s*:\\s*(("(?:[^"\\\\]|\\\\.)*")|('(?:[^'\\\\]|\\\\.)*'))`)
  );
  return match ? decodeStringLiteral(match[1]) : undefined;
}

function readBooleanProperty(source, property) {
  const match = source.match(new RegExp(`\\b${property}\\s*:\\s*(true|false)`));
  return match ? match[1] === "true" : undefined;
}

function readNumericConstants(source) {
  const values = new Map();
  for (const match of source.matchAll(/\bconst\s+([A-Z][A-Z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)/g)) {
    values.set(match[1], Number(match[2]));
  }
  return values;
}

function readCenterConstants(source) {
  const values = new Map();
  const pattern =
    /\bconst\s+([A-Z][A-Z0-9_]*)\s*:\s*\[\s*number\s*,\s*number\s*\]\s*=\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/g;
  for (const match of source.matchAll(pattern)) {
    values.set(match[1], [Number(match[2]), Number(match[3])]);
  }
  return values;
}

function readCenterProperty(source, constants) {
  const literal = source.match(
    /\bcenter\s*:\s*\[\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\]/
  );
  if (literal) {
    return [Number(literal[1]), Number(literal[2])];
  }
  const identifier = source.match(/\bcenter\s*:\s*([A-Z][A-Z0-9_]*)/);
  return identifier ? constants.get(identifier[1]) : undefined;
}

function readZoomProperty(source, constants) {
  const literal = source.match(/\bzoom\s*:\s*(-?\d+(?:\.\d+)?)/);
  if (literal) {
    return Number(literal[1]);
  }
  const identifier = source.match(/\bzoom\s*:\s*([A-Z][A-Z0-9_]*)/);
  return identifier ? constants.get(identifier[1]) : undefined;
}

function findMatchingDelimiter(source, startIndex, opening, closing) {
  let depth = 0;
  let quote = "";
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = startIndex; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = "";
      continue;
    }
    if (character === "/" && next === "/") {
      lineComment = true;
      index += 1;
      continue;
    }
    if (character === "/" && next === "*") {
      blockComment = true;
      index += 1;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === opening) depth += 1;
    if (character === closing) {
      depth -= 1;
      if (depth === 0) return index;
    }
  }

  throw new Error(`无法定位匹配的 ${closing}`);
}

function splitRegionObjects(source) {
  const objects = [];
  let index = 0;
  while (index < source.length) {
    const start = source.indexOf("{", index);
    if (start === -1) break;
    const end = findMatchingDelimiter(source, start, "{", "}");
    objects.push({
      source: source.slice(start, end + 1),
      start,
      end
    });
    index = end + 1;
  }
  return objects;
}

function normalizeRegionConfig(region) {
  if (!region || typeof region !== "object") return null;
  const center = Array.isArray(region.center) ? region.center.map(Number) : [];
  const zoom = Number(region.zoom);
  if (
    typeof region.id !== "string" ||
    typeof region.name !== "string" ||
    center.length !== 2 ||
    !center.every(Number.isFinite) ||
    !Number.isFinite(zoom)
  ) {
    return null;
  }
  return {
    id: region.id,
    name: region.name,
    center: [center[0], center[1]],
    zoom,
    ...(region.isCitywide ? { isCitywide: true } : {}),
    ...(typeof region.dataPath === "string" ? { dataPath: normalizeSeparators(region.dataPath) } : {})
  };
}

function parseCityConfigSource(source, configPath) {
  const declaration = source.search(/\bconst\s+regions\s*:\s*RegionConfig\[\]\s*=/);
  if (declaration === -1) {
    throw new Error(`无法在 ${configPath} 中找到 regions 配置`);
  }
  const assignment = source.indexOf("=", declaration);
  const arrayStart = source.indexOf("[", assignment);
  const arrayEnd = findMatchingDelimiter(source, arrayStart, "[", "]");
  const centerConstants = readCenterConstants(source);
  const numericConstants = readNumericConstants(source);
  const regionEntries = splitRegionObjects(source.slice(arrayStart + 1, arrayEnd))
    .map(entry => ({
      ...entry,
      region: normalizeRegionConfig({
        id: readStringProperty(entry.source, "id"),
        name: readStringProperty(entry.source, "name"),
        center: readCenterProperty(entry.source, centerConstants),
        zoom: readZoomProperty(entry.source, numericConstants),
        isCitywide: readBooleanProperty(entry.source, "isCitywide"),
        dataPath: readStringProperty(entry.source, "dataPath")
      })
    }))
    .filter(entry => Boolean(entry.region));
  const regions = regionEntries.map(entry => entry.region);

  return { source, arrayStart, arrayEnd, regions, regionEntries };
}

async function readSourceCityConfig(citySlug) {
  const configPath = path.resolve(cityConfigRoot, `${citySlug}.config.ts`);
  if (!configPath.startsWith(cityConfigRoot) || !fssync.existsSync(configPath)) {
    return null;
  }
  return {
    citySlug,
    configPath,
    relativeConfigPath: normalizeSeparators(path.relative(path.resolve(studioRoot, "../fzu-food-map"), configPath)),
    ...parseCityConfigSource(await fs.readFile(configPath, "utf8"), configPath)
  };
}

async function readAllSourceCityConfigs() {
  if (!fssync.existsSync(cityConfigRoot)) return new Map();
  const configs = new Map();
  const entries = await fs.readdir(cityConfigRoot, { withFileTypes: true });
  for (const entry of entries) {
    const match = entry.isFile() ? entry.name.match(/^(.+)\.config\.ts$/) : null;
    if (!match) continue;
    const config = await readSourceCityConfig(match[1]);
    if (config) configs.set(match[1], config);
  }
  return configs;
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

  await syncRegionConfigCache();
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

function createEmptyRegionCache() {
  return { version: 1, cities: {} };
}

async function readRegionCache() {
  if (!fssync.existsSync(regionCachePath)) return createEmptyRegionCache();
  try {
    const raw = await readRawJsonFile(regionCachePath);
    const cities = {};
    for (const [citySlug, city] of Object.entries(raw?.cities ?? {})) {
      const regions = Array.isArray(city?.regions)
        ? city.regions.map(normalizeRegionConfig).filter(Boolean)
        : [];
      cities[citySlug] = {
        configPath:
          typeof city?.configPath === "string"
            ? normalizeSeparators(city.configPath)
            : `src/cities/${citySlug}.config.ts`,
        regions
      };
    }
    return { version: 1, cities };
  } catch {
    return createEmptyRegionCache();
  }
}

function inferRegionId(relativePath, existingIds) {
  const withoutExtension = normalizeSeparators(relativePath).replace(/\.geojson$/i, "");
  const parts = withoutExtension.split("/").filter(Boolean);
  const baseId = (parts.at(-1) ?? "region")
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "region";
  let candidate = baseId;
  let suffix = 2;
  while (existingIds.has(candidate)) {
    candidate = `${baseId}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function resolveDocumentCenter(document) {
  const coordinates = (document?.features ?? [])
    .map(feature => feature?.geometry?.coordinates)
    .filter(
      point =>
        Array.isArray(point) &&
        point.length >= 2 &&
        Number.isFinite(Number(point[0])) &&
        Number.isFinite(Number(point[1]))
    )
    .map(point => [Number(point[0]), Number(point[1])]);
  if (!coordinates.length) return null;

  let minLng = coordinates[0][0];
  let maxLng = coordinates[0][0];
  let minLat = coordinates[0][1];
  let maxLat = coordinates[0][1];
  for (const [lng, lat] of coordinates.slice(1)) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  return [
    Number(((minLng + maxLng) / 2).toFixed(8)),
    Number(((minLat + maxLat) / 2).toFixed(8))
  ];
}

async function collectCachedGeoJsonPaths() {
  const byCity = new Map();
  await walkGeoJsonFiles(cacheRoot, async ({ absolutePath, relativePath }) => {
    const normalizedPath = normalizeSeparators(relativePath);
    const citySlug = normalizedPath.split("/")[0];
    if (!citySlug || !fssync.existsSync(path.resolve(cityConfigRoot, `${citySlug}.config.ts`))) return;
    const items = byCity.get(citySlug) ?? [];
    let document = null;
    try {
      document = await readJsonFile(absolutePath);
    } catch {
      document = null;
    }
    items.push({ relativePath: normalizedPath, document });
    byCity.set(citySlug, items);
  });
  return byCity;
}

async function syncRegionConfigCache() {
  const [current, sourceConfigs, cachedFilesByCity] = await Promise.all([
    readRegionCache(),
    readAllSourceCityConfigs(),
    collectCachedGeoJsonPaths()
  ]);
  const next = createEmptyRegionCache();

  for (const [citySlug, sourceConfig] of sourceConfigs) {
    const currentCity = current.cities[citySlug];
    const sourceRegions = sourceConfig.regions.filter(region => region.dataPath);
    const currentRegions = (currentCity?.regions ?? []).filter(region => region.dataPath);
    const currentByDataPath = new Map(
      currentRegions.map(region => [normalizeSeparators(region.dataPath), region])
    );
    const cachedFiles = cachedFilesByCity.get(citySlug) ?? [];
    const cachedFilesByDataPath = new Map(
      cachedFiles.map(file => [`data/${file.relativePath}`, file])
    );
    const retainedRegions = [];
    const retainedDataPaths = new Set();
    const existingIds = new Set(sourceRegions.map(region => region.id));

    for (const sourceRegion of sourceRegions) {
      const dataPath = normalizeSeparators(sourceRegion.dataPath);
      if (!cachedFilesByDataPath.has(dataPath)) continue;
      const cachedRegion = currentByDataPath.get(dataPath);
      retainedRegions.push({
        ...structuredClone(sourceRegion),
        center: cachedRegion?.center
          ? [...cachedRegion.center]
          : [...sourceRegion.center],
        zoom: cachedRegion?.zoom ?? sourceRegion.zoom
      });
      retainedDataPaths.add(dataPath);
    }

    for (const file of cachedFiles) {
      const dataPath = `data/${file.relativePath}`;
      if (retainedDataPaths.has(dataPath)) continue;
      const cachedRegion = currentByDataPath.get(dataPath);
      const cachedIdAvailable = cachedRegion?.id && !existingIds.has(cachedRegion.id);
      const id = cachedIdAvailable
        ? cachedRegion.id
        : inferRegionId(file.relativePath, existingIds);
      existingIds.add(id);
      retainedRegions.push({
        id,
        name: cachedRegion?.name ?? path.basename(file.relativePath, ".geojson"),
        center: cachedRegion?.center
          ? [...cachedRegion.center]
          : resolveDocumentCenter(file.document) ?? [0, 0],
        zoom: cachedRegion?.zoom ?? DEFAULT_REGION_ZOOM,
        dataPath
      });
      retainedDataPaths.add(dataPath);
    }

    next.cities[citySlug] = {
      configPath: sourceConfig.relativeConfigPath,
      regions: retainedRegions
    };
  }

  if (stableSerialize(current) !== stableSerialize(next)) {
    await writeRawJsonFile(regionCachePath, next);
  }
  return next;
}

function findRegionByFilePath(city, relativePath) {
  if (!city) return null;
  const dataPath = `data/${normalizeSeparators(relativePath)}`;
  return city.regions.find(region => normalizeSeparators(region.dataPath ?? "") === dataPath) ?? null;
}

async function getFileRegionConfig(relativePath) {
  const normalizedPath = normalizeSeparators(relativePath);
  const citySlug = normalizedPath.split("/")[0];
  const [cache, sourceConfig] = await Promise.all([readRegionCache(), readSourceCityConfig(citySlug)]);
  const cachedRegion = findRegionByFilePath(cache.cities[citySlug], normalizedPath);
  if (!cachedRegion || !sourceConfig) return null;
  const sourceRegion = findRegionByFilePath({ regions: sourceConfig.regions }, normalizedPath);
  return {
    configPath: sourceConfig.relativeConfigPath,
    data: cachedRegion,
    sourceData: sourceRegion,
    dirty: stableSerialize(cachedRegion) !== stableSerialize(sourceRegion),
    inferred: !sourceRegion
  };
}

async function isRegionConfigDirty() {
  const [cache, sourceConfigs] = await Promise.all([readRegionCache(), readAllSourceCityConfigs()]);
  for (const [citySlug, city] of Object.entries(cache.cities)) {
    const sourceConfig = sourceConfigs.get(citySlug);
    const sourceRegions = sourceConfig?.regions.filter(region => region.dataPath) ?? null;
    if (!sourceRegions || stableSerialize(city.regions) !== stableSerialize(sourceRegions)) {
      return true;
    }
  }
  return false;
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

    const [dataDirty, regionConfig] = await Promise.all([
      isFileDirty(childPath),
      getFileRegionConfig(childPath)
    ]);
    children.push({
      type: "file",
      name: entry.name,
      path: childPath,
      featureCount,
      dirty: dataDirty || Boolean(regionConfig?.dirty),
      regionDirty: Boolean(regionConfig?.dirty)
    });
  }

  return children;
}

function collectFeatureTaxonomy(feature, categories, tagGroups) {
  const category = normalizeCategoryValue(feature?.properties?.category);
  if (category) {
    categories.add(category);
  }

  const normalizedGroups = normalizeTagGroups(feature?.properties?.tags);
  for (const key of TAG_GROUP_KEYS) {
    for (const tag of normalizedGroups[key]) {
      tagGroups[key].add(tag);
    }
  }
}

function collectDocumentTaxonomy(document) {
  const categories = new Set([DEFAULT_CATEGORY]);
  const tagGroups = Object.fromEntries(TAG_GROUP_KEYS.map(key => [key, new Set()]));

  for (const feature of document?.features ?? []) {
    collectFeatureTaxonomy(feature, categories, tagGroups);
  }

  return normalizeTaxonomy({
    categories: [...categories],
    ...Object.fromEntries(TAG_GROUP_KEYS.map(key => [key, [...tagGroups[key]]]))
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
    ...Object.fromEntries(
      TAG_GROUP_KEYS.map(key => [key, [...current[key], ...(partial?.[key] ?? [])]])
    )
  });
}

async function collectTaxonomyFromCache() {
  const categories = new Set([DEFAULT_CATEGORY]);
  const tagGroups = Object.fromEntries(TAG_GROUP_KEYS.map(key => [key, new Set()]));

  await walkGeoJsonFiles(cacheRoot, async ({ absolutePath }) => {
    try {
      const content = await readJsonFile(absolutePath);
      const taxonomy = collectDocumentTaxonomy(content);
      for (const category of taxonomy.categories) {
        categories.add(category);
      }
      for (const key of TAG_GROUP_KEYS) {
        for (const tag of taxonomy[key]) {
          tagGroups[key].add(tag);
        }
      }
    } catch {
      return;
    }
  });

  return normalizeTaxonomy({
    categories: [...categories],
    ...Object.fromEntries(TAG_GROUP_KEYS.map(key => [key, [...tagGroups[key]]]))
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

  return mergeTaxonomyCache(
    kind === "category" ? { categories: [normalizedValue] } : { [kind]: [normalizedValue] }
  );
}

async function buildWorkspace() {
  await ensureCacheInitialized();
  const regionConfigDirty = await isRegionConfigDirty();
  return {
    sourceRoot: normalizeSeparators(path.relative(studioRoot, sourceRoot)),
    cacheRoot: normalizeSeparators(path.relative(studioRoot, cacheRoot)),
    regionCachePath: normalizeSeparators(path.relative(studioRoot, regionCachePath)),
    regionConfigDirty,
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
  const regionConfig = await getFileRegionConfig(relativePath);
  const dataDirty = await isFileDirty(relativePath);
  return {
    path: normalizeSeparators(relativePath),
    dirty: dataDirty || Boolean(regionConfig?.dirty),
    data,
    sourceData: fssync.existsSync(sourcePath) ? await readJsonFile(sourcePath) : null,
    regionConfig
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

async function updateRegionConfig(relativePath, data) {
  await ensureCacheInitialized();
  const normalizedPath = normalizeSeparators(relativePath);
  const citySlug = normalizedPath.split("/")[0];
  const cache = await readRegionCache();
  const city = cache.cities[citySlug];
  const region = findRegionByFilePath(city, normalizedPath);
  if (!city || !region) {
    throw new Error("当前 GeoJSON 没有可编辑的地区配置");
  }

  const center = Array.isArray(data?.center) ? data.center.map(Number) : [];
  const zoom = Number(data?.zoom);
  if (
    center.length !== 2 ||
    !center.every(Number.isFinite) ||
    center[0] < -180 ||
    center[0] > 180 ||
    center[1] < -90 ||
    center[1] > 90
  ) {
    throw new Error("地区中心点坐标无效");
  }
  if (!Number.isFinite(zoom) || zoom < 0 || zoom > 22) {
    throw new Error("默认显示层级必须在 0 到 22 之间");
  }

  region.center = [center[0], center[1]];
  region.zoom = zoom;
  await writeRawJsonFile(regionCachePath, cache);
  return {
    file: await getFile(normalizedPath),
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

function updateRegionViewProperties(objectSource, region) {
  const withCenter = objectSource.replace(
    /(\bcenter\s*:\s*)(?:\[\s*-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?\s*\]|[A-Z][A-Z0-9_]*)/,
    (_match, prefix) => `${prefix}[${region.center[0]}, ${region.center[1]}]`
  );
  return withCenter.replace(
    /(\bzoom\s*:\s*)(?:-?\d+(?:\.\d+)?|[A-Z][A-Z0-9_]*)/,
    (_match, prefix) => `${prefix}${region.zoom}`
  );
}

function formatNewRegionObject(region) {
  return [
    "{",
    `    id: ${JSON.stringify(region.id)},`,
    `    name: ${JSON.stringify(region.name)},`,
    `    center: [${region.center[0]}, ${region.center[1]}],`,
    `    zoom: ${region.zoom},`,
    `    dataPath: ${JSON.stringify(normalizeSeparators(region.dataPath))}`,
    "  }"
  ].join("\n");
}

function indentRegionObject(objectSource) {
  const lines = objectSource.trim().split(/\r?\n/);
  lines[0] = `  ${lines[0]}`;
  return lines.join("\n");
}

function formatRegionConfigArray(sourceConfig, cachedRegions) {
  const cachedByDataPath = new Map(
    cachedRegions.map(region => [normalizeSeparators(region.dataPath), region])
  );
  const usedDataPaths = new Set();
  const objectSources = [];

  for (const entry of sourceConfig.regionEntries) {
    const sourceRegion = entry.region;
    if (!sourceRegion.dataPath) {
      objectSources.push(entry.source);
      continue;
    }
    const dataPath = normalizeSeparators(sourceRegion.dataPath);
    const cachedRegion = cachedByDataPath.get(dataPath);
    if (!cachedRegion) continue;
    objectSources.push(updateRegionViewProperties(entry.source, cachedRegion));
    usedDataPaths.add(dataPath);
  }

  for (const region of cachedRegions) {
    const dataPath = normalizeSeparators(region.dataPath);
    if (usedDataPaths.has(dataPath)) continue;
    objectSources.push(formatNewRegionObject(region));
  }

  return [
    "[",
    ...objectSources.map((objectSource, index) =>
      `${indentRegionObject(objectSource)}${index === objectSources.length - 1 ? "" : ","}`
    ),
    "]"
  ].join("\n");
}

async function overwriteRegionConfigsFromCache() {
  const cache = await readRegionCache();
  for (const [citySlug, city] of Object.entries(cache.cities)) {
    const sourceConfig = await readSourceCityConfig(citySlug);
    if (!sourceConfig) {
      throw new Error(`找不到城市配置：${citySlug}.config.ts`);
    }
    const replacement = formatRegionConfigArray(sourceConfig, city.regions);
    const nextSource =
      sourceConfig.source.slice(0, sourceConfig.arrayStart) +
      replacement +
      sourceConfig.source.slice(sourceConfig.arrayEnd + 1);
    await fs.writeFile(sourceConfig.configPath, nextSource, "utf8");
  }
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
  await overwriteRegionConfigsFromCache();

  return {
    file: await getFile(relativePath),
    workspace: await buildWorkspace()
  };
}

async function saveAllFiles() {
  await overwriteSourceFromCache();
  await overwriteRegionConfigsFromCache();
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

    if (request.method === "PUT" && url.pathname === "/api/region") {
      const body = await readBody(request);
      if (typeof body.path !== "string") {
        throw new Error("缺少文件路径");
      }
      if (!body.data || typeof body.data !== "object") {
        throw new Error("缺少地区配置");
      }
      sendJson(response, 200, await updateRegionConfig(body.path, body.data));
      return;
    }

    if (request.method === "PUT" && url.pathname === "/api/taxonomy") {
      const body = await readBody(request);
      if (body.kind !== "category" && !TAG_GROUP_KEYS.includes(body.kind)) {
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

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  server.listen(port, "127.0.0.1", () => {
    console.log(`FFM Studio API running at http://127.0.0.1:${port}`);
  });
}

export { formatRegionConfigArray, parseCityConfigSource };
