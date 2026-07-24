import { beforeEach, describe, expect, it, vi } from "vitest";

const cookieGetMock = vi.fn();
vi.mock("next/headers", () => ({ cookies: () => ({ get: cookieGetMock }) }));

const findByTokenHashMock = vi.fn();
const findByIdMock = vi.fn();
const findActiveMembershipMock = vi.fn();
vi.mock("@/platform/auth/production-auth-runtime", () => ({
  createProductionAuthRuntime: () => ({
    users: { findById: findByIdMock, findActiveMembership: findActiveMembershipMock },
    sessions: { findByTokenHash: findByTokenHashMock },
    secret: "test-secret-at-least-32-characters-long",
  }),
}));

async function load() {
  return import("@/platform/auth/production-request-context");
}

const activeUser = { id: "user-1", email: "hr@northwind.ph", passwordHash: "x", passwordSalt: "y", status: "active" };
const activeMembership = { tenantId: "nw-ph", roles: ["hr_admin"], status: "active" };

describe("resolveProductionRequestContext", () => {
  beforeEach(() => {
    vi.resetModules();
    cookieGetMock.mockReset();
    findByTokenHashMock.mockReset();
    findByIdMock.mockReset();
    findActiveMembershipMock.mockReset();
  });

  it("returns undefined when there is no session cookie at all", async () => {
    cookieGetMock.mockReturnValue(undefined);
    const { resolveProductionRequestContext } = await load();
    await expect(resolveProductionRequestContext()).resolves.toBeUndefined();
    expect(findByTokenHashMock).not.toHaveBeenCalled();
  });

  it("returns undefined when the session token does not match any stored session", async () => {
    cookieGetMock.mockReturnValue({ value: "unknown-token" });
    findByTokenHashMock.mockResolvedValue(undefined);
    const { resolveProductionRequestContext } = await load();
    await expect(resolveProductionRequestContext()).resolves.toBeUndefined();
  });

  it("returns undefined for an expired session", async () => {
    cookieGetMock.mockReturnValue({ value: "expired-token" });
    findByTokenHashMock.mockResolvedValue({ id: "s1", userId: "user-1", tenantId: "nw-ph", expiresAt: new Date(Date.now() - 1000) });
    const { resolveProductionRequestContext } = await load();
    await expect(resolveProductionRequestContext()).resolves.toBeUndefined();
    expect(findByIdMock).not.toHaveBeenCalled();
  });

  it("returns undefined for a disabled user even with a valid, unexpired session", async () => {
    cookieGetMock.mockReturnValue({ value: "valid-token" });
    findByTokenHashMock.mockResolvedValue({ id: "s1", userId: "user-1", tenantId: "nw-ph", expiresAt: new Date(Date.now() + 100000) });
    findByIdMock.mockResolvedValue({ ...activeUser, status: "disabled" });
    const { resolveProductionRequestContext } = await load();
    await expect(resolveProductionRequestContext()).resolves.toBeUndefined();
    expect(findActiveMembershipMock).not.toHaveBeenCalled();
  });

  it("returns undefined when the session's tenant membership is missing or inactive", async () => {
    cookieGetMock.mockReturnValue({ value: "valid-token" });
    findByTokenHashMock.mockResolvedValue({ id: "s1", userId: "user-1", tenantId: "nw-ph", expiresAt: new Date(Date.now() + 100000) });
    findByIdMock.mockResolvedValue(activeUser);
    findActiveMembershipMock.mockResolvedValue(undefined);
    const { resolveProductionRequestContext } = await load();
    await expect(resolveProductionRequestContext()).resolves.toBeUndefined();
  });

  it("resolves the correct verified context for a valid session, deriving tenant/roles/permissions only from the database", async () => {
    cookieGetMock.mockReturnValue({ value: "valid-token" });
    findByTokenHashMock.mockResolvedValue({ id: "s1", userId: "user-1", tenantId: "nw-ph", expiresAt: new Date(Date.now() + 100000) });
    findByIdMock.mockResolvedValue(activeUser);
    findActiveMembershipMock.mockResolvedValue(activeMembership);

    const { resolveProductionRequestContext } = await load();
    const context = await resolveProductionRequestContext();

    expect(context).toBeDefined();
    expect(context?.principal.userId).toBe("user-1");
    expect(context?.principal.tenantId).toBe("nw-ph");
    expect(context?.roles).toEqual(["hr_admin"]);
    expect(context?.permissions.has("people.read")).toBe(true);
    expect(context?.permissions.has("people.employee.hire")).toBe(true);
    expect(context?.actorProvenance).toBe("server_verified");
  });

  it("drops any role string from the database that isn't a known PlatformRole (defense in depth)", async () => {
    cookieGetMock.mockReturnValue({ value: "valid-token" });
    findByTokenHashMock.mockResolvedValue({ id: "s1", userId: "user-1", tenantId: "nw-ph", expiresAt: new Date(Date.now() + 100000) });
    findByIdMock.mockResolvedValue(activeUser);
    findActiveMembershipMock.mockResolvedValue({ tenantId: "nw-ph", roles: ["hr_admin", "super_admin_backdoor"], status: "active" });

    const { resolveProductionRequestContext } = await load();
    const context = await resolveProductionRequestContext();

    expect(context?.roles).toEqual(["hr_admin"]);
  });
});
