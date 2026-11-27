import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths(), react()],
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", ".next", "e2e/**"],
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: { junit: "reports/junit.xml" },
    coverage: {
      provider: "v8",
      // Business logic lives in lib/ — that's what we hold to a coverage bar.
      include: ["lib/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "lib/db.ts", // Prisma client singleton (infrastructure, no logic)
      ],
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "coverage",
      thresholds: {
        lines: 70,
        functions: 70,
        statements: 70,
        branches: 60,
      },
    },
  },
});
