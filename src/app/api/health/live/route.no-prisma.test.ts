import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("liveness route source", () => {
  it("has zero imports (no database, repository, or Prisma dependency is even possible)", () => {
    const content = readFileSync(join(__dirname, "route.ts"), "utf8");
    const imports = [...content.matchAll(/(?:from\s+|require\()\s*["']([^"']+)["']/g)];
    expect(imports).toHaveLength(0);
  });
});
