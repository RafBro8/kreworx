import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // 5200/4200 rather than the usual 5173/4000 so Kreworx can run alongside
    // the other projects on this machine without a port fight.
    port: 5200,
    proxy: {
      "/api": { target: "http://localhost:4200", changeOrigin: true },
      "/socket.io": { target: "http://localhost:4200", ws: true },
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/setupTests.ts"],
    css: false,
  },
});
