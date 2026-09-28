/// <reference types="vitest" />
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const backendUrl = env.VITE_API_BASE_URL || "http://localhost:8000";

  return {
    plugins: [react()],
    server: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": backendUrl,
        "/health": backendUrl,
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 5173,
      strictPort: true,
      proxy: {
        "/api": backendUrl,
        "/health": backendUrl,
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: [],
    },
  };
});
