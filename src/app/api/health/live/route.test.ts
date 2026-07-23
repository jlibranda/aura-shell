import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/health/live/route";

describe("GET /api/health/live", () => {
  it("returns 200 with status live and no database dependency", async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.status).toBe("live");
    expect(typeof body.timestamp).toBe("string");
  });
});
