import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // Mongo binaries download on first run and the in-memory server takes a
    // moment to boot, so the default 5s timeout is too tight on a cold machine.
    testTimeout: 30_000,
    hookTimeout: 120_000,
  },
});
