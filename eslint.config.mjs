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
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python and docs build artefacts that share this repo root. Without these,
    // ESLint walks .venv/lib/**/site-packages and lints Jupyter's bundled JS,
    // which buries real warnings under tens of thousands of vendored ones and
    // makes `npm run lint` useless as a gate.
    ".venv/**",
    "venv/**",
    "site/**",
    "**/__pycache__/**",
  ]),
]);

export default eslintConfig;
