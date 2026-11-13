/// <reference types="vitest/config" />
/**
 * Vite configuration for the code app.
 *
 * Two aliases let the app share code with the rest of the repository instead of copying it:
 *   @engine  the decision engine the public site uses (site/js/engine.js), so both give the same answer.
 *   @schema  the Dataverse design (powerplatform/dataverse/schema.mjs), for choice values and table names.
 *   @describe the change describer the sync uses (powerplatform/sync/describe.mjs), so demo mode matches.
 */
import { defineConfig, type Plugin } from "vite";
import fs from "node:fs";
import react from "@vitejs/plugin-react";
import { powerApps } from "@microsoft/power-apps-vite/plugin";
import path from "node:path";

const repo = path.resolve(__dirname, "../..");

/**
 * Demo mode only: serves the repository's data/ folder at /data/, so `npm run demo` shows the real
 * catalogue with no environment, network or sign-in. It is never part of the Power Apps build.
 */
function repoData(): Plugin {
  return {
    name: "repo-data",
    apply: "serve",
    configureServer(server) {
      server.middlewares.use("/data", (req, res, next) => {
        const file = path.join(repo, "data", decodeURIComponent((req.url ?? "").split("?")[0]));
        if (!file.startsWith(path.join(repo, "data")) || !fs.existsSync(file)) return next();
        res.setHeader("Content-Type", "application/json");
        fs.createReadStream(file).pipe(res);
      });
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Relative asset URLs: Power Apps serves the app from its own path, not the domain root.
  base: "./",
  plugins: [react(), powerApps(), ...(mode === "demo" ? [repoData()] : [])],
  resolve: {
    alias: {
      "@engine": path.join(repo, "site/js/engine.js"),
      "@schema": path.join(repo, "powerplatform/dataverse/schema.mjs"),
      "@describe": path.join(repo, "powerplatform/sync/describe.mjs"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  server: {
    port: 3000,
    // The aliases point outside this folder, so the dev server must be allowed to read the repository.
    fs: { allow: [repo] },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Fluent UI is most of the bundle and changes rarely; a separate chunk caches well between releases.
        manualChunks: { fluent: ["@fluentui/react-components"] },
      },
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
  },
}));
