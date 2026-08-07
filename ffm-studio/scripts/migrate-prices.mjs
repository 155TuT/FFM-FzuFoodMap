import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsRoot = fileURLToPath(new URL(".", import.meta.url));
const studioRoot = path.resolve(scriptsRoot, "..");
const sourceRoot = path.resolve(studioRoot, "../fzu-food-map/public/data");
const cacheRoot = path.resolve(studioRoot, ".cache/data");
const checkOnly = process.argv.includes("--check");

function normalizePrice(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/^\s*(?:\u4eba\u5747)?\s*/, "")
    .replace(/[\u00a5\uffe5]/g, "")
    .trim();
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

let fileCount = 0;
let featureCount = 0;
let changedFileCount = 0;
let changedPriceCount = 0;

for (const root of [sourceRoot, cacheRoot]) {
  for (const filePath of await listGeoJsonFiles(root)) {
    fileCount += 1;
    const currentText = await fs.readFile(filePath, "utf8");
    const document = JSON.parse(currentText);
    let fileChanged = false;

    for (const feature of document.features ?? []) {
      featureCount += 1;
      const properties = feature.properties;
      if (!properties || typeof properties !== "object" || !("price" in properties)) continue;
      const nextPrice = normalizePrice(properties.price);
      if (nextPrice === properties.price) continue;
      properties.price = nextPrice;
      fileChanged = true;
      changedPriceCount += 1;
    }

    if (fileChanged) {
      changedFileCount += 1;
      if (!checkOnly) {
        await fs.writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
      }
    }
  }
}

console.log(
  `${checkOnly ? "检查" : "迁移"}完成：${fileCount} 个文件，${featureCount} 个点位，` +
    `${changedFileCount} 个 GeoJSON、${changedPriceCount} 个价格字段` +
    `${checkOnly ? "需要更新" : "已更新"}`
);

if (checkOnly && changedPriceCount > 0) process.exitCode = 1;
