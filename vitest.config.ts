import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Mirror the `@/*` alias from tsconfig.json. Without this, any module
    // using the alias fails to resolve under Vitest and the whole test file
    // collects 0 tests instead of reporting a useful error.
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
  },
});