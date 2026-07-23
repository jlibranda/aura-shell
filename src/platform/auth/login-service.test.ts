import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/platform/auth/password";
import { authenticateAndCreateSession, terminateSession } from "@/platform/auth/login-service";
import type { SessionRepository } from "@/platform/auth/session-repository";
import type { UserRepository } from "@/platform/auth/user-repository";

const SECRET = "test-secret-at-least-32-characters-long";

function repos(overrides: { users?: Partial<UserRepository>; sessions?: Partial<SessionRepository> } = {}) {
  const users: UserRepository = {
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findActiveMembership: vi.fn(),
    findActiveMemberships: vi.fn().mockResolvedValue([]),
    createUser: vi.fn(),
    upsertMembership: vi.fn(),
    ...overrides.users,
  };
  const sessions: SessionRepository = {
    create: vi.fn().mockResolvedValue({ id: "session-1", userId: "user-1", tenantId: "nw-ph", expiresAt: new Date() }),
    findByTokenHash: vi.fn(),
    deleteByTokenHash: vi.fn(),
    ...overrides.sessions,
  };
  return { users, sessions };
}

describe("authenticateAndCreateSession", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => vi.restoreAllMocks());

  it("succeeds for a correct password and active membership, creating a session for the first tenant", async () => {
    const { hash, salt } = await hashPassword("correct-horse-battery-staple");
    const deps = repos({
      users: {
        findByEmail: vi.fn().mockResolvedValue({ id: "user-1", email: "hr@northwind.ph", passwordHash: hash, passwordSalt: salt, status: "active" }),
        findActiveMemberships: vi.fn().mockResolvedValue([{ tenantId: "nw-ph", roles: ["hr_admin"], status: "active" }]),
      },
    });

    const result = await authenticateAndCreateSession("hr@northwind.ph", "correct-horse-battery-staple", "corr-1", { ...deps, secret: SECRET });

    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.userId).toBe("user-1");
      expect(result.tenantId).toBe("nw-ph");
      expect(result.token).toBeTruthy();
    }
    expect(deps.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ userId: "user-1", tenantId: "nw-ph" }));
  });

  it("returns a generic failure for an unknown email (no user enumeration)", async () => {
    const deps = repos({ users: { findByEmail: vi.fn().mockResolvedValue(undefined) } });
    const result = await authenticateAndCreateSession("nobody@northwind.ph", "whatever", "corr-1", { ...deps, secret: SECRET });
    expect(result).toEqual({ kind: "failure", reason: "invalid_credentials" });
  });

  it("returns a generic failure for a wrong password (same shape as unknown email)", async () => {
    const { hash, salt } = await hashPassword("correct-horse-battery-staple");
    const deps = repos({ users: { findByEmail: vi.fn().mockResolvedValue({ id: "user-1", email: "hr@northwind.ph", passwordHash: hash, passwordSalt: salt, status: "active" }) } });
    const result = await authenticateAndCreateSession("hr@northwind.ph", "totally-wrong", "corr-1", { ...deps, secret: SECRET });
    expect(result).toEqual({ kind: "failure", reason: "invalid_credentials" });
  });

  it("rejects a disabled user", async () => {
    const { hash, salt } = await hashPassword("correct-horse-battery-staple");
    const deps = repos({ users: { findByEmail: vi.fn().mockResolvedValue({ id: "user-1", email: "hr@northwind.ph", passwordHash: hash, passwordSalt: salt, status: "disabled" }) } });
    const result = await authenticateAndCreateSession("hr@northwind.ph", "correct-horse-battery-staple", "corr-1", { ...deps, secret: SECRET });
    expect(result).toEqual({ kind: "failure", reason: "disabled_user" });
  });

  it("rejects a user with no active tenant membership", async () => {
    const { hash, salt } = await hashPassword("correct-horse-battery-staple");
    const deps = repos({
      users: {
        findByEmail: vi.fn().mockResolvedValue({ id: "user-1", email: "hr@northwind.ph", passwordHash: hash, passwordSalt: salt, status: "active" }),
        findActiveMemberships: vi.fn().mockResolvedValue([]),
      },
    });
    const result = await authenticateAndCreateSession("hr@northwind.ph", "correct-horse-battery-staple", "corr-1", { ...deps, secret: SECRET });
    expect(result).toEqual({ kind: "failure", reason: "no_tenant_membership" });
  });

  it("never logs the password or the session token", async () => {
    const { hash, salt } = await hashPassword("correct-horse-battery-staple");
    const deps = repos({
      users: {
        findByEmail: vi.fn().mockResolvedValue({ id: "user-1", email: "hr@northwind.ph", passwordHash: hash, passwordSalt: salt, status: "active" }),
        findActiveMemberships: vi.fn().mockResolvedValue([{ tenantId: "nw-ph", roles: ["hr_admin"], status: "active" }]),
      },
    });

    const result = await authenticateAndCreateSession("hr@northwind.ph", "correct-horse-battery-staple", "corr-1", { ...deps, secret: SECRET });

    const allLoggedText = [...logSpy.mock.calls, ...errorSpy.mock.calls].map((call) => String(call[0])).join("\n");
    expect(allLoggedText).not.toContain("correct-horse-battery-staple");
    if (result.kind === "success") expect(allLoggedText).not.toContain(result.token);
  });
});

describe("terminateSession", () => {
  it("deletes the session by its token hash", async () => {
    const deps = repos();
    vi.spyOn(console, "log").mockImplementation(() => undefined);
    const token = "a-real-looking-session-token";

    await terminateSession(token, "corr-1", { sessions: deps.sessions, secret: SECRET });

    expect(deps.sessions.deleteByTokenHash).toHaveBeenCalledTimes(1);
    const [calledHash] = (deps.sessions.deleteByTokenHash as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(calledHash).not.toContain(token);
  });
});
