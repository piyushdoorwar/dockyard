import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The UI lives in web/ and is built into dist/web, which the API server serves.
// In dev, Vite proxies /api (REST + WebSockets) to the server on :41739.
export default defineConfig({
  root: "web",
  plugins: [react(), tailwindcss()],
  build: { outDir: "../dist/web", emptyOutDir: true },
  server: {
    port: 5173,
    proxy: { "/api": { target: "http://127.0.0.1:41739", ws: true } },
  },
});
