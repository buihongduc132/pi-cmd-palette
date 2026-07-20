import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["extensions/**/*.test.ts"],
    exclude: ["node_modules/**", "scripts/**"],
    coverage: {
      provider: "v8",
      include: ["extensions/**/*.ts"],
      exclude: [
        "extensions/**/*.test.ts",
        "extensions/index.ts",
        "extensions/**/*.spec.ts",
      ],
      thresholds: {
        lines: 85,
        branches: 85,
        functions: 80,
        statements: 85,
      },
    },
  },
});
