import { defineConfig } from "vitest/config"
import path from "node:path"

// Tests cover the pure logic in src/lib/utils only — the cascade maths that `npm run
// build` cannot validate. This is deliberately not a full app test setup; there is no
// jsdom or React testing here.
export default defineConfig({
  test: {
    environment: "node",
    include: ["src/lib/**/*.test.ts"],
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
})
