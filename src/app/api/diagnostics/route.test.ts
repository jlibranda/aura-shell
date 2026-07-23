import { describe, expect, it, vi } from "vitest";

vi.mock("@/platform/startup", () => ({
  ensureStartupValidated: vi.fn().mockResolvedValue(undefined),
  getStartupState: vi.fn().mockReturnValue({
    status: "ready",
    startedAt: "2026-01-01T00:00:00.000Z",
    checks: { environment: "valid", database: "reachable", migrations: "compatible" },
  }),
}));

describe("GET /api/diagnostics", () => {
  it("returns safe operational fields without exposing secrets or connection strings", async () => {
    const { GET } = await import("@/app/api/diagnostics/route");
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ startup: { status: "ready" }, environment: "valid", migrations: "compatible" });
    expect(typeof body.version).toBe("string");

    const serialized = JSON.stringify(body).toLowerCase();
    for (const forbidden of ["postgresql://", "secret", "token", "password"]) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});
