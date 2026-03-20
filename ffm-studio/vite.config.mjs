import path from "node:path";
import { fileURLToPath } from "node:url";

const studioRoot = fileURLToPath(new URL(".", import.meta.url));
const sharedNodeModules = path.resolve(studioRoot, "../fzu-food-map/node_modules");
const apiPort = Number(process.env.FFM_STUDIO_API_PORT ?? 4173);
const sharedEnvDir = path.resolve(studioRoot, "../fzu-food-map");

export default {
  envDir: sharedEnvDir,
  resolve: {
    alias: {
      react: path.resolve(sharedNodeModules, "react"),
      "react/jsx-runtime": path.resolve(sharedNodeModules, "react/jsx-runtime.js"),
      "react-dom": path.resolve(sharedNodeModules, "react-dom"),
      "react-dom/client": path.resolve(sharedNodeModules, "react-dom/client.js")
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    proxy: {
      "/api": `http://127.0.0.1:${apiPort}`
    },
    fs: {
      allow: [studioRoot, path.resolve(studioRoot, "../fzu-food-map")]
    }
  },
  preview: {
    host: "127.0.0.1",
    port: 4174
  },
  build: {
    chunkSizeWarningLimit: 1100,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ["react", "react-dom"]
        }
      }
    }
  }
};
