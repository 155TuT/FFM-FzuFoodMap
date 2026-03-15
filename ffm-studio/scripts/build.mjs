import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const studioRoot = path.resolve(scriptsDir, "..");
const viteBin = path.resolve(studioRoot, "../fzu-food-map/node_modules/vite/bin/vite.js");

if (!fs.existsSync(viteBin)) {
  console.error("未找到 Vite 运行文件，请先确保 fzu-food-map 的依赖已安装。");
  process.exit(1);
}

const result = spawnSync(process.execPath, [viteBin, "build", "--config", "vite.config.mjs"], {
  cwd: studioRoot,
  stdio: "inherit",
  env: { ...process.env }
});

process.exit(result.status ?? 0);
