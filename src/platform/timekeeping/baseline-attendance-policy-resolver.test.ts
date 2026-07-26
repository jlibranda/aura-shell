import { describe, expect, it } from "vitest";
import { PermissionSet, type PermissionSet as PermissionSetType, type PlatformRole, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import { AttendancePolicyStore, InMemoryAttendancePolicyReadRepository, InMemoryAttendancePolicyWriteRepository } from "@/platform/timekeeping/in-memory-attendance-policy-repository";
import { BaselineAttendancePolicyResolver } from "@/platform/timekeeping/baseline-attendance-policy-resolver";
import type { AttendancePolicyResolutionInput } from "@/platform/timekeeping/attendance-policy";
import type { CreateAttendancePolicyInput } from "@/platform/timekeeping/attendance-policy-repository";

function context(tenantId = "tenant-a", roles: readonly PlatformRole[] = ["hr_admin"]): TenantContext {
  return {
    tenantId,
    actorId: "user-1",
    actorName: "A",
    roles,
    permissions: new PermissionSet(["timekeeping.view"]) as PermissionSetType,
    correlationId: "c",
    authenticationMethod: "test",
    actorProvenance: "server_verified",
  };
}

function input(overrides: Partial<AttendancePolicyResolutionInput> = {}): AttendancePolicyResolutionInput {
  return { tenantId: "tenant-a", personId: "p1", attendanceAnchorInstant: "2026-06-01T00:00:00.000Z", ...overrides };
}

async function seedTenantPolicy(store: AttendancePolicyStore, overrides: Partial<CreateAttendancePolicyInput> = {}) {
  const write = new InMemoryAttendancePolicyWriteRepository(store);
  return write.create({
    tenantId: "tenant-a",
    scope: "TENANT",
    scopeId: "tenant-a",
    effectiveFrom: "2026-01-01T00:00:00.000Z",
    roundingIntervalMinutes: 15,
    roundingDirection: "nearest",
    gracePeriodMinutes: 5,
    latenessToleranceMinutes: 10,
    unpaidBreakMinutes: 60,
    standardWorkWeekMinutes: 2400,
    isStandardWorkWeekStatutoryFloor: false,
    dailyOvertimeThresholdMinutes: 480,
    calculationAlgorithmVersion: 1,
    fingerprint: "hash-1",
    createdBy: "actor",
    ...overrides,
  });
}

describe("BaselineAttendancePolicyResolver", () => {
  it("resolves the configured Tenant-scoped policy as of the anchor instant, with the exact approved flat contract", async () => {
    const store = new AttendancePolicyStore();
    await seedTenantPolicy(store);
    const resolver = new BaselineAttendancePolicyResolver(new InMemoryAttendancePolicyReadRepository(store));
    const result = await resolver.resolve(context(), input());
    expect(result.kind).toBe("resolved");
    if (result.kind === "resolved") {
      expect(result.policy.scope).toBe("TENANT");
      expect(result.policy.roundingIntervalMinutes).toBe(15);
      expect(result.policy.roundingDirection).toBe("nearest");
      expect(Object.keys(result.policy).sort()).toEqual(
        [
          "policyId",
          "policyVersionId",
          "scope",
          "scopeId",
          "tenantId",
          "effectiveFrom",
          "roundingIntervalMinutes",
          "roundingDirection",
          "gracePeriodMinutes",
          "latenessToleranceMinutes",
          "unpaidBreakMinutes",
          "standardWorkWeekMinutes",
          "isStandardWorkWeekStatutoryFloor",
          "dailyOvertimeThresholdMinutes",
          "calculationAlgorithmVersion",
          "fingerprint",
        ].sort(),
      );
    }
  });

  it("returns configuration_incomplete when no Tenant-scoped policy has been configured", async () => {
    const store = new AttendancePolicyStore();
    const resolver = new BaselineAttendancePolicyResolver(new InMemoryAttendancePolicyReadRepository(store));
    const result = await resolver.resolve(context(), input());
    expect(result.kind).toBe("configuration_incomplete");
    if (result.kind === "configuration_incomplete") {
      expect(result.missingScope).toBe("TENANT");
      expect(result.reason).toBeTruthy();
    }
  });

  it("returns configuration_incomplete when the anchor instant precedes the policy's effective start", async () => {
    const store = new AttendancePolicyStore();
    await seedTenantPolicy(store, { effectiveFrom: "2027-01-01T00:00:00.000Z" });
    const resolver = new BaselineAttendancePolicyResolver(new InMemoryAttendancePolicyReadRepository(store));
    const result = await resolver.resolve(context(), input({ attendanceAnchorInstant: "2026-06-01T00:00:00.000Z" }));
    expect(result.kind).toBe("configuration_incomplete");
  });

  it("resolves historically against a since-replaced version, not just the current one", async () => {
    const store = new AttendancePolicyStore();
    const first = await seedTenantPolicy(store, { effectiveFrom: "2026-01-01T00:00:00.000Z", fingerprint: "hash-old" });
    const write = new InMemoryAttendancePolicyWriteRepository(store);
    await write.end({ tenantId: "tenant-a", policyVersionId: first.policyVersionId, effectiveUntil: "2026-06-01T00:00:00.000Z" });
    await seedTenantPolicy(store, { policyId: first.policyId, effectiveFrom: "2026-06-01T00:00:00.000Z", fingerprint: "hash-new" });

    const resolver = new BaselineAttendancePolicyResolver(new InMemoryAttendancePolicyReadRepository(store));
    const historical = await resolver.resolve(context(), input({ attendanceAnchorInstant: "2026-03-01T00:00:00.000Z" }));
    expect(historical.kind).toBe("resolved");
    if (historical.kind === "resolved") expect(historical.policy.fingerprint).toBe("hash-old");

    const current = await resolver.resolve(context(), input({ attendanceAnchorInstant: "2026-07-01T00:00:00.000Z" }));
    expect(current.kind).toBe("resolved");
    if (current.kind === "resolved") expect(current.policy.fingerprint).toBe("hash-new");
  });

  it("never independently queries Organization state — ignoring caller-supplied legalEntityId/orgUnitId/locationId produces the same result", async () => {
    const store = new AttendancePolicyStore();
    await seedTenantPolicy(store);
    const resolver = new BaselineAttendancePolicyResolver(new InMemoryAttendancePolicyReadRepository(store));
    const withoutIds = await resolver.resolve(context(), input());
    const withIds = await resolver.resolve(context(), input({ legalEntityId: "le-1", orgUnitId: "ou-1", locationId: "loc-1" }));
    expect(withoutIds).toEqual(withIds);
  });

  it("requires timekeeping.view", async () => {
    const store = new AttendancePolicyStore();
    await seedTenantPolicy(store);
    const resolver = new BaselineAttendancePolicyResolver(new InMemoryAttendancePolicyReadRepository(store));
    await expect(resolver.resolve(context("tenant-a", []), input())).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("rejects a cross-tenant input", async () => {
    const store = new AttendancePolicyStore();
    await seedTenantPolicy(store);
    const resolver = new BaselineAttendancePolicyResolver(new InMemoryAttendancePolicyReadRepository(store));
    await expect(resolver.resolve(context("tenant-a"), input({ tenantId: "tenant-b" }))).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("does not leak tenant B's policy into tenant A's resolution", async () => {
    const store = new AttendancePolicyStore();
    await seedTenantPolicy(store, { tenantId: "tenant-b", scopeId: "tenant-b" });
    const resolver = new BaselineAttendancePolicyResolver(new InMemoryAttendancePolicyReadRepository(store));
    const result = await resolver.resolve(context("tenant-a"), input({ tenantId: "tenant-a" }));
    expect(result.kind).toBe("configuration_incomplete");
  });
});
