import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/ready/route";

/** Calls the route handler directly against the real database — no server needed. */
describe("GET /api/health/ready (integration)", () => {
  it("returns 200 and status ready when the real database is reachable and migrations are compatible", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "ready", startup: "ready", database: "reachable" });
  });
});
