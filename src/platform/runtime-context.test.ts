import { describe, expect, it } from "vitest";
import { createApplicationRuntime } from "@/platform/application-runtime";
import { AuthorizationError } from "@/platform/errors";
import { createTenantContext, createTrustedRequestContext } from "@/platform/runtime-context";

const request = () => createTrustedRequestContext({ principal: { subjectId: "subject-a", tenantId: "tenant-a", userId: "user-a", displayName: "Ari Admin", authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" }, roles: ["hr_admin"], permissions: ["people.read"], actorProvenance: "server_verified", correlationId: "request-a", receivedAt: "2026-01-01T00:00:01.000Z" });

describe("trusted runtime context", () => {
  it("creates an isolated tenant context from an authenticated session", () => {
    const context = createTenantContext(request());

    expect(context).toEqual({
      tenantId: "tenant-a",
      actorId: "user-a",
      actorName: "Ari Admin",
      roles: ["hr_admin"],
      permissions: expect.anything(),
      correlationId: "request-a",
      authenticationMethod: "test",
      actorProvenance: "server_verified",
    });
    expect(context.permissions.has("people.read")).toBe(true);
  });

  it("rejects unauthenticated or incomplete sessions", () => {
    expect(() => createTrustedRequestContext({ principal: { ...request().principal, tenantId: " " }, roles: [], permissions: [], actorProvenance: "server_verified" })).toThrow(AuthorizationError);
  });

  it("exposes application services through a request-local runtime", async () => {
    const runtime = createApplicationRuntime(request());
    const result = await runtime.people.list(runtime.context, { limit: 1 });

    expect(runtime.context.tenantId).toBe("tenant-a");
    expect(result.items).toHaveLength(1);
  });

  it("keeps principal provenance and correlation request-scoped", () => {
    const first = createTrustedRequestContext({ principal: request().principal, roles: ["hr_admin"], permissions: ["people.read"], actorProvenance: "server_verified" });
    const second = createTrustedRequestContext({ principal: request().principal, roles: ["hr_admin"], permissions: ["people.read"], actorProvenance: "server_verified" });
    expect(first.correlationId).not.toBe(second.correlationId);
    expect(Object.isFrozen(first.principal)).toBe(true);
    expect(Object.isFrozen(first.roles)).toBe(true);
    expect(first.permissions.toArray()).toEqual(["people.read"]);
  });
});
