import { configDefaults, defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  test: { environment: "node", exclude: [...configDefaults.exclude, "**/*.integration.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
