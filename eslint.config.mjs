import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // globalIgnores() replaces ESLint's built-in node_modules/.git ignores, so re-add them.
    "**/node_modules/**",
    "**/.git/**",
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Agent-tool worktrees: whole duplicate copies of this repo sitting on disk.
    // Git ignores them via .kilo/.gitignore; ESLint does not read that, so it
    // was linting a second copy of the codebase and emitting phantom warnings.
    "**/.kilo/**",
    "**/.claude/**",
    // Vendored binaries copied by `npm run ocr:assets`: minified tesseract
    // worker + WASM core. Not source; linting them is noise.
    "**/public/vendor/**",
    "**/*.min.js",
  ]),
]);

export default eslintConfig;
