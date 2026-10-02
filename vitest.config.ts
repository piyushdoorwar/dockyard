import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "server",
          environment: "node",
          include: ["server/test/**/*.test.ts"],
        },
      },
      {
        plugins: [react()],
        test: {
          name: "web",
          environment: "jsdom",
          globals: true,
          include: ["web/test/**/*.test.{ts,tsx}"],
          setupFiles: ["web/test/setup.ts"],
          css: false,
        },
      },
    ],
  },
});
