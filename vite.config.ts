import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The UI lives in web/ and is built into dist/web, which the API server serves.
// In dev, Vite proxies /api (REST + WebSockets) to the server on :41739.
export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  // Served from localhost only, so one ~1 MB bundle is fine — no need to code-split.
  build: { outDir: "../dist/web", emptyOutDir: true, chunkSizeWarningLimit: 1500 },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:41739", ws: true } },
  },
});
