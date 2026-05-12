import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "node:path";
import { userContextPlugin } from "../../server/vitePlugin";

// Project root is src/report/app/. The CLI writes output/analysis.json at the
// repo root, which is three dirs up. Point Vite's static-serve directory there
// so /analysis.json resolves to <repo>/output/analysis.json without copying.
export default defineConfig({
  plugins: [
    react(),
    userContextPlugin({
      contextPath: path.resolve(__dirname, "../../../data/user-context.json"),
    }),
  ],
  publicDir: path.resolve(__dirname, "../../../output"),
  server: {
    port: 5173,
  },
});
