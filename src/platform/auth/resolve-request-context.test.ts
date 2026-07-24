import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const redirectMock = vi.fn((url: string) => {
  const error = new Error(`NEXT_REDIRECT:${url}`) as Error & { digest: string };
  error.digest = `NEXT_REDIRECT;replace;${url};307;`;
  throw error;
});
vi.mock("next/navigation", () => ({ redirect: redirectMock }));

const getDevelopmentRequestContextMock = vi.fn();
vi.mock("@/platform/development-session", () => ({ getDevelopmentRequestContext: getDevelopmentRequestContextMock }));

const resolveProductionRequestContextMock = vi.fn();
vi.mock("@/platform/auth/production-request-context", () => ({ resolveProductionRequestContext: resolveProductionRequestContextMock }));

async function load() {
  return import("@/platform/auth/resolve-request-context");
}

describe("resolveRequestContext", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    redirectMock.mockClear();
    getDevelopmentRequestContextMock.mockReset();
    resolveProductionRequestContextMock.mockReset();
  });

  afterEach(() => {
    vi.stubEnv("NODE_ENV", originalNodeEnv ?? "test");
  });

  it("uses the development adapter outside production and never touches production resolution", async () => {
    vi.stubEnv("NODE_ENV", "development");
    const devContext = { principal: { tenantId: "nw-ph" } };
    getDevelopmentRequestContextMock.mockReturnValue(devContext);

    const { resolveRequestContext } = await load();
    await expect(resolveRequestContext()).resolves.toBe(devContext);
    expect(resolveProductionRequestContextMock).not.toHaveBeenCalled();
  });

  it("redirects to /login in production when no verified session exists", async () => {
    vi.stubEnv("NODE_ENV", "production");
    resolveProductionRequestContextMock.mockResolvedValue(undefined);

    const { resolveRequestContext } = await load();
    await expect(resolveRequestContext()).rejects.toThrow(/NEXT_REDIRECT:\/login/);
    expect(getDevelopmentRequestContextMock).not.toHaveBeenCalled();
  });

  it("returns the verified production context when one exists, without redirecting", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const prodContext = { principal: { tenantId: "nw-ph" } };
    resolveProductionRequestContextMock.mockResolvedValue(prodContext);

    const { resolveRequestContext } = await load();
    await expect(resolveRequestContext()).resolves.toBe(prodContext);
    expect(redirectMock).not.toHaveBeenCalled();
  });
});
