import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

/** One ESLint config for the whole monorepo (apps/web, apps/api, packages/shared). */
const eslintConfig = [
  ...compat.extends("next/core-web-vitals", "next/typescript", "prettier"),
  {
    settings: { next: { rootDir: "apps/web/" } },
    rules: {
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "always"],
    },
  },
  {
    // NestJS dependency injection reads constructor parameter types at runtime
    // (emitDecoratorMetadata). Auto-fixing those imports to `import type` would erase them and
    // silently break DI — so this rule must stay off for the API.
    files: ["apps/api/**/*.ts"],
    rules: { "@typescript-eslint/consistent-type-imports": "off" },
  },
  {
    // Jest config files are CommonJS.
    files: ["apps/api/jest*.config.js"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // CI helper scripts: plain CommonJS Node scripts whose job is printing a summary to stdout.
    files: [".github/scripts/**/*.cjs"],
    rules: { "@typescript-eslint/no-require-imports": "off", "no-console": "off" },
  },
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/out/**",
      "**/build/**",
      "**/coverage/**",
      "**/playwright-report/**",
      "**/test-results/**",
      "**/reports/**",
      "**/next-env.d.ts",
    ],
  },
];

export default eslintConfig;
