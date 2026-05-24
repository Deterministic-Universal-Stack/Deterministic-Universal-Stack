import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@dus/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@dus/math": path.resolve(__dirname, "packages/math/src/index.ts"),
      "@dus/network": path.resolve(__dirname, "packages/network/src/index.ts"),
      "@dus/runtime": path.resolve(__dirname, "packages/runtime/src/index.ts"),
      "@dus/storage": path.resolve(__dirname, "packages/storage/src/index.ts")
    }
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    coverage: {
      enabled: false
    }
  }
});
