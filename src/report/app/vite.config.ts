import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev model: the ASP.NET Core API runs separately (dotnet run). Vite serves the
// React app with HMR and proxies /api and the auth routes to that API, so the
// browser sees a single origin — matching production.
const API_TARGET = process.env.API_TARGET ?? "http://localhost:5000";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: true },
      "/login": { target: API_TARGET, changeOrigin: true },
      "/logout": { target: API_TARGET, changeOrigin: true },
      "/dev-login": { target: API_TARGET, changeOrigin: true },
      "/access-denied": { target: API_TARGET, changeOrigin: true },
      "/signin-google": { target: API_TARGET, changeOrigin: true },
    },
  },
});
