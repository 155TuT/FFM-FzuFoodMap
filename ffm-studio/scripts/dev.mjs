import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const studioRoot = path.resolve(scriptsDir, "..");
const viteBin = path.resolve(studioRoot, "../fzu-food-map/node_modules/vite/bin/vite.js");
const apiEntry = path.resolve(studioRoot, "server/index.mjs");
const apiPort = Number(process.env.FFM_STUDIO_API_PORT ?? 4173);
const apiOrigin = `http://127.0.0.1:${apiPort}`;

if (!fs.existsSync(viteBin)) {
  console.error("未找到 Vite 运行文件，请先确保 fzu-food-map 的依赖已安装。");
  process.exit(1);
}

const children = [];
let shuttingDown = false;

function withEnv(extraEnv = {}) {
  return { ...process.env, ...extraEnv, FFM_STUDIO_API_PORT: String(apiPort) };
}

function spawnChild(command, args, extraEnv = {}) {
  const child = spawn(command, args, {
    cwd: studioRoot,
    stdio: "inherit",
    env: withEnv(extraEnv)
  });

  child.on("error", error => {
    if (!shuttingDown) {
      shuttingDown = true;
      console.error(error);
      process.exit(1);
    }
  });

  child.on("exit", code => {
    if (!shuttingDown) {
      shuttingDown = true;
      for (const item of children) {
        if (item !== child && !item.killed) {
          item.kill("SIGTERM");
        }
      }
      process.exit(code ?? 0);
    }
  });

  children.push(child);
  return child;
}

function isPortInUse(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: "127.0.0.1", port });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => {
      socket.destroy();
      resolve(false);
    });
  });
}

async function isStudioApiAlive() {
  try {
    const response = await fetch(`${apiOrigin}/api/workspace`);
    return response.ok;
  } catch {
    return false;
  }
}

async function resolveApiMode() {
  if (await isStudioApiAlive()) {
    console.log(`FFM Studio API already running at ${apiOrigin}, reusing it.`);
    return "reuse";
  }

  if (await isPortInUse(apiPort)) {
    console.error(`端口 ${apiPort} 已被其他进程占用，且当前不是 FFM Studio API。请先释放该端口后再启动。`);
    process.exit(1);
  }

  return "spawn";
}

const apiMode = await resolveApiMode();

if (apiMode === "spawn") {
  spawnChild(process.execPath, [apiEntry]);
}

spawnChild(process.execPath, [viteBin, "--config", "vite.config.mjs"]);

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed) {
      child.kill("SIGTERM");
    }
  }
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
