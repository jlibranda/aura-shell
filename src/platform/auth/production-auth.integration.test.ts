import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { hashPassword } from "@/platform/auth/password";
import { hashSessionToken, generateSessionToken } from "@/platform/auth/session-token";
import { PrismaUserRepository } from "@/platform/auth/prisma-user-repository";
import { PrismaSessionRepository } from "@/platform/auth/prisma-session-repository";
import { getPrismaClient } from "@/platform/persistence/prisma-client";

const cookieGetMock = vi.fn();
vi.mock("next/headers", () => ({ cookies: () => ({ get: cookieGetMock }) }));

/**
 * Exercises the real Prisma-backed User/TenantMembership/Session repositories
 * and resolveProductionRequestContext() end to end against the real
 * database — the parts the mocked unit suite (production-request-context.test.ts)
 * cannot verify: actual schema shape, actual query correctness, actual FK/cascade behavior.
 */
describe("production authentication (integration)", () => {
  const prisma = getPrismaClient();
  const tenantId = "test-tenant-6m01";
  const email = `test-admin-${randomUUID()}@example.invalid`;
  let userId: string;

  beforeAll(async () => {
    await prisma.tenant.upsert({ where: { id: tenantId }, create: { id: tenantId }, update: {} });
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => undefined);
  });

  beforeEach(() => {
    cookieGetMock.mockReset();
  });

  it("resolves a verified request context end-to-end through the real database", async () => {
    const users = new PrismaUserRepository(prisma);
    const sessions = new PrismaSessionRepository(prisma);
    const secret = process.env.NEXTAUTH_SECRET as string;
    expect(secret).toBeTruthy();

    const { hash, salt } = await hashPassword("integration-test-passphrase-2026");
    const user = await users.createUser({ email, passwordHash: hash, passwordSalt: salt });
    userId = user.id;
    await users.upsertMembership({ userId: user.id, tenantId, roles: ["hr_admin"] });

    const token = generateSessionToken();
    await sessions.create({ tokenHash: hashSessionToken(token, secret), userId: user.id, tenantId, expiresAt: new Date(Date.now() + 60_000) });

    cookieGetMock.mockReturnValue({ value: token });
    const { resolveProductionRequestContext } = await import("@/platform/auth/production-request-context");
    const context = await resolveProductionRequestContext();

    expect(context).toBeDefined();
    expect(context?.principal.userId).toBe(user.id);
    expect(context?.principal.tenantId).toBe(tenantId);
    expect(context?.roles).toEqual(["hr_admin"]);
    expect(context?.permissions.has("people.employee.hire")).toBe(true);
  });

  it("rejects a session whose token does not match any stored hash, even against the real database", async () => {
    cookieGetMock.mockReturnValue({ value: "a-token-nobody-ever-issued" });
    const { resolveProductionRequestContext } = await import("@/platform/auth/production-request-context");
    await expect(resolveProductionRequestContext()).resolves.toBeUndefined();
  });
});
