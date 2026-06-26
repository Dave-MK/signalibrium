import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".codex-tmp-next-build*/**",
    ".signalibrium-next/**",
    ".signalibrium-build/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent worktree scratch copies — never part of the real source tree.
    ".claude/**",
  ]),
  {
    rules: {
      // React 19's strict hooks rule fires on our intentional client-mount
      // hydration patterns (setMounted(true), hydrate-from-localStorage,
      // sync-prop-to-state). These are deliberate and correct here, so we keep
      // them visible as warnings rather than failing the lint gate. Genuine
      // cascading-render bugs should still be reviewed when this warns.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
]);

export default eslintConfig;
