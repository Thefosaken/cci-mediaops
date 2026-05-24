import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Pragmatic rule relaxations.
    // - `react-hooks/set-state-in-effect` flags legitimate sync patterns
    //   (resetting forms when a URL param flips, syncing one source of truth
    //   into another). We use these intentionally; downgrade to warning.
    // - `react-hooks/purity` flags `Date.now()` inside server async
    //   functions even though Next re-evaluates them per request.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/purity": "warn",
    },
  },
]);

export default eslintConfig;
