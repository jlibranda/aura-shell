import { describe, expect, it } from "vitest";
import { ensureStartupValidated } from "@/platform/startup";

/**
 * Exercises startup validation against the real database configured by
 * DATABASE_URL. Requires a reachable, migrated Postgres — the same one
 * `npm run seed:development` targets. The unreachable-database and
 * incomplete-migration paths are covered by the mocked unit suite
 * (src/platform/startup.test.ts); this file proves the real driver call
 * actually succeeds end-to-end against a live database.
 */
describe("startup validation (integration)", () => {
  it("reports ready against the real, migrated development database", async () => {
    const result = await ensureStartupValidated();

    expect(result.status).toBe("ready");
    if (result.status === "ready") {
      expect(result.checks).toEqual({ environment: "valid", database: "reachable", migrations: "compatible" });
    }
  });
});
