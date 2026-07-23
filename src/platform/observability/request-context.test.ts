import { beforeEach, describe, expect, it, vi } from "vitest";

const getMock = vi.fn();
vi.mock("next/headers", () => ({ headers: () => ({ get: getMock }) }));

describe("getRequestCorrelationId", () => {
  beforeEach(() => {
    vi.resetModules();
    getMock.mockReset();
  });

  it("returns the correlation ID middleware attached to the request", async () => {
    getMock.mockReturnValue("00000000-0000-0000-0000-000000000001");
    const { getRequestCorrelationId } = await import("@/platform/observability/request-context");
    expect(getRequestCorrelationId()).toBe("00000000-0000-0000-0000-000000000001");
  });

  it("generates a fresh ID when the header is missing", async () => {
    getMock.mockReturnValue(null);
    const { getRequestCorrelationId } = await import("@/platform/observability/request-context");
    const id = getRequestCorrelationId();
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("generates a fresh ID instead of throwing outside a request scope", async () => {
    vi.doMock("next/headers", () => ({
      headers: () => {
        throw new Error("headers was called outside a request scope");
      },
    }));
    vi.resetModules();
    const { getRequestCorrelationId } = await import("@/platform/observability/request-context");
    expect(() => getRequestCorrelationId()).not.toThrow();
    expect(getRequestCorrelationId()).toMatch(/^[0-9a-f-]{36}$/);
  });
});
