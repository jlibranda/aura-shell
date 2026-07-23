import { defineConfig } from "vitest/config";
import path from "node:path";

// Integration tests hit a real Postgres via DATABASE_URL; load .env the same
// way `next dev`/Prisma CLI do, since vitest itself does not.
try {
  process.loadEnvFile();
} catch {
  // No .env present (e.g. CI supplies real env vars directly) — fine.
}

/**
 * Integration suite: exercises real Postgres connectivity (health/readiness,
 * startup DB + migration checks). Requires DATABASE_URL to point at a real,
 * migrated database — the same one `npm run seed:development` targets.
 */
export default defineConfig({
  test: { environment: "node", include: ["src/**/*.integration.test.ts"] },
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
});
