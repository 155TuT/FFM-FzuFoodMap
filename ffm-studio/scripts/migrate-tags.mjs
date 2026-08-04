import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const studioRoot = path.resolve(scriptsRoot, "..");
const sourceRoot = path.resolve(studioRoot, "../fzu-food-map/public/data");
const cacheRoot = path.resolve(studioRoot, ".cache/data");
const taxonomyPath = path.resolve(studioRoot, ".cache/taxonomy.json");
const classifiedTaxonomyPath = path.resolve(studioRoot, ".cache/new_taxonomy.json");
const checkOnly = process.argv.includes("--check");

const TAG_GROUP_KEYS = [
  "cuisines",
  "price_range",
  "characteristics",
  "dish",
  "miscellaneous"
];

function clean(values) {
  if (!Array.isArray(values)) return [];
  return [...new Set(values.filter(value => typeof value === "string").map(value => value.trim()).filter(Boolean))];
}

function sortZh(values) {
  return [...values].sort((left, right) => left.localeCompare(right, "zh-CN"));
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function buildClassification(taxonomy) {
  const tagToGroup = new Map();
  for (const key of TAG_GROUP_KEYS) {
    for (const tag of clean(taxonomy[key])) {
      const previous = tagToGroup.get(tag);
      if (previous) {
        throw new Error(`标签“${tag}”同时出现在 ${previous} 和 ${key}`);
      }
      tagToGroup.set(tag, key);
    }
  }
  return tagToGroup;
}

function emptyGroups() {
  return Object.fromEntries(TAG_GROUP_KEYS.map(key => [key, []]));
}

function migrateTags(rawTags, tagToGroup, unknownTags) {
  const result = emptyGroups();
  if (Array.isArray(rawTags)) {
    for (const tag of clean(rawTags)) {
      const key = tagToGroup.get(tag) ?? "miscellaneous";
      if (!tagToGroup.has(tag)) unknownTags.add(tag);
      result[key].push(tag);
    }
    return result;
  }

  const source = rawTags && typeof rawTags === "object" ? rawTags : {};
  for (const key of TAG_GROUP_KEYS) {
    for (const tag of clean(source[key])) {
      const classifiedKey = tagToGroup.get(tag) ?? key;
      if (!tagToGroup.has(tag)) unknownTags.add(tag);
      result[classifiedKey].push(tag);
    }
  }
  for (const key of TAG_GROUP_KEYS) result[key] = clean(result[key]);
  return result;
}

async function listGeoJsonFiles(root) {
  const files = [];
  async function walk(directory) {
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const childPath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(childPath);
      else if (entry.isFile() && entry.name.endsWith(".geojson")) files.push(childPath);
    }
  }
  await walk(root);
  return files;
}

const classifiedTaxonomy = await readJson(classifiedTaxonomyPath);
const currentTaxonomy = await readJson(taxonomyPath);
const tagToGroup = buildClassification(classifiedTaxonomy);
const classifiedTags = new Set(tagToGroup.keys());
const knownTags = new Set(
  Array.isArray(currentTaxonomy.tags)
    ? clean(currentTaxonomy.tags)
    : TAG_GROUP_KEYS.flatMap(key => clean(currentTaxonomy[key]))
);
const missingClassifications = [...knownTags].filter(tag => !classifiedTags.has(tag));
if (missingClassifications.length) {
  throw new Error(`new_taxonomy.json 尚未分类这些已有标签：${missingClassifications.join("、")}`);
}

const unknownTags = new Set();
let fileCount = 0;
let featureCount = 0;
let changedFileCount = 0;
for (const root of [sourceRoot, cacheRoot]) {
  for (const filePath of await listGeoJsonFiles(root)) {
    fileCount += 1;
    const document = await readJson(filePath);
    for (const feature of document.features ?? []) {
      featureCount += 1;
      if (!feature.properties || typeof feature.properties !== "object") continue;
      feature.properties.tags = migrateTags(feature.properties.tags, tagToGroup, unknownTags);
    }
    const nextText = `${JSON.stringify(document, null, 2)}\n`;
    const currentText = await fs.readFile(filePath, "utf8");
    if (nextText !== currentText) {
      changedFileCount += 1;
      if (!checkOnly) await fs.writeFile(filePath, nextText, "utf8");
    }
  }
}

const nextTaxonomy = {
  categories: sortZh(clean(classifiedTaxonomy.categories)),
  ...Object.fromEntries(TAG_GROUP_KEYS.map(key => [key, sortZh(clean(classifiedTaxonomy[key]))]))
};
const currentTaxonomyText = await fs.readFile(taxonomyPath, "utf8");
const nextTaxonomyText = `${JSON.stringify(nextTaxonomy, null, 2)}\n`;
const taxonomyChanged = currentTaxonomyText !== nextTaxonomyText;
if (taxonomyChanged && !checkOnly) await writeJson(taxonomyPath, nextTaxonomy);

if (unknownTags.size) {
  console.warn(`未在分类表中找到、已保留在 miscellaneous 的标签：${[...unknownTags].join("、")}`);
}

console.log(
  `${checkOnly ? "检查" : "迁移"}完成：${fileCount} 个文件，${featureCount} 个点位，` +
    `${changedFileCount} 个 GeoJSON ${checkOnly ? "需要更新" : "已更新"}，taxonomy${taxonomyChanged ? "已变更" : "无变更"}`
);

if (checkOnly && (changedFileCount > 0 || taxonomyChanged)) process.exitCode = 1;
