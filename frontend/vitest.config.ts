import { defineConfig } from "vitest/config";
import path from "node:path";

/**
 * Vitest config for project-level unit + property-based tests.
 *
 * Scope is limited to `tests/unit/**` so vitest does NOT discover the
 * Playwright specs in `tests/e2e/**` (those are driven by `npm run test:e2e`).
 *
 * Path alias mirrors `tsconfig.json` so `@/...` resolves to `src/...` and
 * app imports resolve to the Next.js `app/` folder.
 */
export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    environment: "node",
    globals: false,
    passWithNoTests: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
