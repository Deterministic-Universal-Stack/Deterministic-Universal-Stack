import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@dus/core": path.resolve(__dirname, "packages/core/src/index.ts"),
      "@dus/comms": path.resolve(__dirname, "packages/comms/src/index.ts"),
      "@dus/capabilities": path.resolve(__dirname, "packages/capabilities/src/index.ts"),
      "@dus/math": path.resolve(__dirname, "packages/math/src/index.ts"),
      "@dus/forge": path.resolve(__dirname, "packages/forge/src/index.ts"),
      "@dus/eventlog": path.resolve(__dirname, "packages/eventlog/src/index.ts"),
      "@dus/network": path.resolve(__dirname, "packages/network/src/index.ts"),
      "@dus/navigator": path.resolve(__dirname, "packages/navigator/src/index.ts"),
      "@dus/proof-harness": path.resolve(__dirname, "packages/proof-harness/src/index.ts"),
      "@dus/replay": path.resolve(__dirname, "packages/replay/src/index.ts"),
      "@dus/runtime": path.resolve(__dirname, "packages/runtime/src/index.ts"),
      "@dus/sdk": path.resolve(__dirname, "packages/sdk/src/index.ts"),
      "@dus/social": path.resolve(__dirname, "packages/social/src/index.ts"),
      "@dus/storage": path.resolve(__dirname, "packages/storage/src/index.ts"),
      "@dus/zplane": path.resolve(__dirname, "packages/zplane/src/index.ts"),
      "@dus/zplane/adapters": path.resolve(__dirname, "packages/zplane/src/adapters/index.ts"),
      "@dus/zplane/runtime": path.resolve(__dirname, "packages/zplane/src/runtime/index.ts")
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
