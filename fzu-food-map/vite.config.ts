import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const repoName = process.env.GITHUB_REPOSITORY?.split("/")[1] ?? "";
const isGhActions = process.env.GITHUB_ACTIONS === "true";
const base = isGhActions && repoName ? `/${repoName}/` : "/";

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react()],
});
