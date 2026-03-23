import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const studioRoot = path.resolve(scriptsDir, "..");
const viteBin = path.resolve(studioRoot, "../fzu-food-map/node_modules/vite/bin/vite.js");
const apiEntry = path.resolve(studioRoot, "server/index.mjs");
const rawApiPort = process.env.FFM_STUDIO_API_PORT;
const preferredApiPort = rawApiPort === undefined ? 4173 : Number(rawApiPort);
const apiHost = "127.0.0.1";
const apiPortSearchLimit = 20;
let apiPort = preferredApiPort;

function getApiOrigin(port) {
  return `http://${apiHost}:${port}`;
}

if (!Number.isInteger(preferredApiPort) || preferredApiPort < 0 || preferredApiPort > 65535) {
  console.error(`Invalid FFM_STUDIO_API_PORT value: ${rawApiPort}`);
  process.exit(1);
}

if (!fs.existsSync(viteBin)) {
  console.error("Unable to find the shared Vite binary. Install dependencies in fzu-food-map first.");
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

function probePort(port) {
  return new Promise(resolve => {
    const tester = net.createServer();
    tester.unref();

    tester.once("error", error => {
      resolve({ available: false, errorCode: error?.code ?? "UNKNOWN" });
    });

    tester.listen({ host: apiHost, port, exclusive: true }, () => {
      const address = tester.address();
      const resolvedPort =
        address && typeof address === "object" && "port" in address ? address.port : port;

      tester.close(() => {
        resolve({ available: true, port: resolvedPort });
      });
    });
  });
}

async function isStudioApiAlive(port) {
  try {
    const response = await fetch(`${getApiOrigin(port)}/api/workspace`);
    return response.ok;
  } catch {
    return false;
  }
}

async function findReusableApiPort() {
  if (preferredApiPort === 0) {
    return null;
  }

  if (await isStudioApiAlive(preferredApiPort)) {
    return preferredApiPort;
  }

  for (let offset = 1; offset <= apiPortSearchLimit; offset += 1) {
    const candidatePort = preferredApiPort + offset;
    if (candidatePort > 65535) {
      break;
    }

    if (await isStudioApiAlive(candidatePort)) {
      return candidatePort;
    }
  }

  return null;
}

async function resolveApiBinding() {
  const reusablePort = await findReusableApiPort();
  if (reusablePort !== null) {
    console.log(`FFM Studio API already running at ${getApiOrigin(reusablePort)}, reusing it.`);
    return { mode: "reuse", port: reusablePort };
  }

  if (preferredApiPort === 0) {
    const dynamicPort = await probePort(0);
    if (dynamicPort.available) {
      return { mode: "spawn", port: dynamicPort.port };
    }

    console.error("Unable to acquire a dynamic port for FFM Studio API.");
    process.exit(1);
  }

  const preferredProbe = await probePort(preferredApiPort);
  if (preferredProbe.available) {
    return { mode: "spawn", port: preferredProbe.port };
  }

  for (let offset = 1; offset <= apiPortSearchLimit; offset += 1) {
    const candidatePort = preferredApiPort + offset;
    if (candidatePort > 65535) {
      break;
    }

    const candidateProbe = await probePort(candidatePort);
    if (candidateProbe.available) {
      console.warn(
        `FFM Studio API port ${preferredApiPort} is unavailable (${preferredProbe.errorCode}), using ${candidateProbe.port}.`
      );
      return { mode: "spawn", port: candidateProbe.port };
    }
  }

  const dynamicPort = await probePort(0);
  if (dynamicPort.available) {
    console.warn(
      `FFM Studio API port ${preferredApiPort} is unavailable (${preferredProbe.errorCode}), using ${dynamicPort.port}.`
    );
    return { mode: "spawn", port: dynamicPort.port };
  }

  console.error(`Unable to find an available port for FFM Studio API starting from ${preferredApiPort}.`);
  process.exit(1);
}

const { mode: apiMode, port: resolvedApiPort } = await resolveApiBinding();
apiPort = resolvedApiPort;

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
