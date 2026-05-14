import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { loadEnv } from "../../loadEnv";
import { userContextPlugin } from "../../server/vitePlugin";

loadEnv();

// Project root is src/report/app/. The CLI writes OUTPUT_FILE (default
// output/analysis.json) at the repo root. Point Vite's static-serve directory
// at the OUTPUT_FILE's parent so /analysis.json resolves to the user-specific
// output without copying. The basename within OUTPUT_FILE must be
// analysis.json — see spec 2026-05-14-multi-user-env-config-design.md.
const outputFile = process.env.OUTPUT_FILE
  ? path.resolve(process.env.OUTPUT_FILE)
  : path.resolve(__dirname, "../../../output/analysis.json");

const contextFile = process.env.USER_CONTEXT_FILE
  ? path.resolve(process.env.USER_CONTEXT_FILE)
  : path.resolve(__dirname, "../../../data/user-context.json");

export default defineConfig({
  plugins: [
    react(),
    userContextPlugin({ contextPath: contextFile }),
  ],
  publicDir: path.dirname(outputFile),
  server: {
    port: 5173,
  },
});
