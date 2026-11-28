import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    reporters: process.env.CI ? ["default", "junit"] : ["default"],
    outputFile: { junit: "reports/junit.xml" },
    coverage: {
      provider: "v8",
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/dto.ts", "src/notes/json-content.ts"],
      reporter: ["text", "json-summary"],
      thresholds: { lines: 70, functions: 70, statements: 70, branches: 60 },
    },
  },
});
