import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";
import { PrismaAttendancePolicyUnitOfWork } from "@/platform/timekeeping/prisma-attendance-policy-unit-of-work";
import { PrismaAttendancePolicyReadRepository } from "@/platform/timekeeping/prisma-attendance-policy-read-repository";
import { AttendancePolicyService } from "@/platform/timekeeping/attendance-policy-service";
import { BaselineAttendancePolicyResolver } from "@/platform/timekeeping/baseline-attendance-policy-resolver";
import type { AttendancePolicyContentDraft } from "@/platform/timekeeping/attendance-policy";
import type { PermissionSet } from "@/platform/context";
import { PermissionSet as PermSet, type TenantContext } from "@/platform/context";

/**
 * Real-Postgres coverage for what an in-memory suite cannot verify: actual
 * $transaction atomicity (policy + audit + outbox commit together), the
 * DB-level GIST exclusion constraint, the CHECK constraints (valid window,
 * recognized scope, tenant/scope_id consistency, recognized lowercase
 * rounding direction, rounding_interval_minutes > 0 with no divides-60
 * restriction), and cross-tenant isolation.
 *
 * A Tenant-scope policy is at most one active row per tenant at a time
 * (ADR-014 §4.7's invariant, enforced by the GIST exclusion constraint
 * itself), so every test that writes a TENANT-scope row seeds its own fresh
 * tenant rather than sharing one across `it` blocks.
 */
describe("attendance policy platform (integration)", () => {
  const prisma = getPrismaClient();
  const createdTenants: string[] = [];

  afterAll(async () => {
    if (createdTenants.length === 0) return;
    await prisma.attendancePolicy.deleteMany({ where: { tenantId: { in: createdTenants } } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: { in: createdTenants } } }).catch(() => undefined);
  });

  async function freshTenant(): Promise<string> {
    const tenantId = `test-tenant-tk5-${randomUUID()}`;
    await prisma.tenant.create({ data: { id: tenantId } });
    createdTenants.push(tenantId);
    return tenantId;
  }

  function content(overrides: Partial<AttendancePolicyContentDraft> = {}): AttendancePolicyContentDraft {
    return {
      effectiveFrom: "2026-01-01T00:00:00.000Z",
      roundingIntervalMinutes: 15,
      roundingDirection: "nearest",
      gracePeriodMinutes: 5,
      latenessToleranceMinutes: 10,
      unpaidBreakMinutes: 60,
      standardWorkWeekMinutes: 2400,
      isStandardWorkWeekStatutoryFloor: false,
      dailyOvertimeThresholdMinutes: 480,
      ...overrides,
    };
  }

  function request(tenantId: string): TrustedRequestContext {
    return createTrustedRequestContext({
      principal: { subjectId: "s", userId: "user-1", tenantId, authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
      roles: ["hr_admin"],
      permissions: ["timekeeping.view", "timekeeping.manage"],
      actorProvenance: "server_verified",
    });
  }

  function readContext(tenantId: string): TenantContext {
    return { tenantId, actorId: "user-1", actorName: "A", roles: ["hr_admin"], permissions: new PermSet(["timekeeping.view"]) as PermissionSet, correlationId: "c", authenticationMethod: "test", actorProvenance: "server_verified" };
  }

  function rawRow(overrides: Record<string, unknown> = {}) {
    return {
      tenantId: "",
      scope: "TENANT",
      scopeId: "",
      effectiveFrom: new Date("2026-01-01"),
      roundingIntervalMinutes: 15,
      roundingDirection: "nearest",
      gracePeriodMinutes: 5,
      latenessToleranceMinutes: 10,
      unpaidBreakMinutes: 60,
      standardWorkWeekMinutes: 2400,
      isStandardWorkWeekStatutoryFloor: false,
      dailyOvertimeThresholdMinutes: 480,
      calculationAlgorithmVersion: 1,
      fingerprint: "h1",
      createdBy: "tester",
      ...overrides,
    };
  }

  it("commits the attendance policy, audit record, and outbox message atomically", async () => {
    const tenantId = await freshTenant();
    const events = new InMemoryDomainEventCollector();
    const audit = new InMemoryAuditCollector();
    const service = new AttendancePolicyService(new PrismaAttendancePolicyUnitOfWork(prisma, events, audit));
    const result = await service.createTenantPolicy(request(tenantId), content());
    expect(result.kind).toBe("success");

    const id = result.kind === "success" ? result.value.policy.policyVersionId : "";
    const dbRow = await prisma.attendancePolicy.findUniqueOrThrow({ where: { policyVersionId: id } });
    expect(dbRow.scope).toBe("TENANT");
    expect(dbRow.scopeId).toBe(tenantId);
    expect(dbRow.roundingDirection).toBe("nearest");
    const dbAudit = await prisma.auditRecord.findFirst({ where: { aggregateId: id, eventName: "timekeeping.attendance_policy.created" } });
    expect(dbAudit).not.toBeNull();
    const dbOutbox = await prisma.outboxMessage.findFirst({ where: { aggregateId: id, eventName: "timekeeping.attendance_policy.created" } });
    expect(dbOutbox).not.toBeNull();
  });

  it("the database's exclusion constraint rejects a second overlapping policy version for the same tenant scope", async () => {
    const tenantId = await freshTenant();
    await prisma.attendancePolicy.create({ data: rawRow({ tenantId, scopeId: tenantId, effectiveFrom: new Date("2026-01-01") }) });
    await expect(prisma.attendancePolicy.create({
      data: rawRow({ tenantId, scopeId: tenantId, effectiveFrom: new Date("2026-06-01"), fingerprint: "h2" }),
    })).rejects.toThrow();
  });

  it("the database's exclusion constraint allows an adjacent window once the earlier row is closed", async () => {
    const tenantId = await freshTenant();
    const first = await prisma.attendancePolicy.create({ data: rawRow({ tenantId, scopeId: tenantId, effectiveFrom: new Date("2026-01-01") }) });
    await prisma.attendancePolicy.update({ where: { policyVersionId: first.policyVersionId }, data: { effectiveUntil: new Date("2026-06-01") } });
    await expect(prisma.attendancePolicy.create({
      data: rawRow({ tenantId, scopeId: tenantId, effectiveFrom: new Date("2026-06-01"), roundingIntervalMinutes: 30, roundingDirection: "up", fingerprint: "h2" }),
    })).resolves.toBeDefined();
  });

  it("the database's CHECK constraint rejects a non-empty window violation (effective_until <= effective_from)", async () => {
    const tenantId = await freshTenant();
    await expect(prisma.attendancePolicy.create({
      data: rawRow({ tenantId, scopeId: tenantId, effectiveFrom: new Date("2026-06-01"), effectiveUntil: new Date("2026-01-01"), fingerprint: "h3" }),
    })).rejects.toThrow();
  });

  it("the database's CHECK constraint rejects an unrecognized scope value", async () => {
    const tenantId = await freshTenant();
    await expect(prisma.attendancePolicy.create({
      data: rawRow({ tenantId, scope: "DEPARTMENT", scopeId: tenantId, effectiveFrom: new Date("2029-01-01"), fingerprint: "h4" }),
    })).rejects.toThrow();
  });

  it("the database's CHECK constraint rejects a TENANT-scope row whose scope_id does not equal tenant_id", async () => {
    const tenantId = await freshTenant();
    await expect(prisma.attendancePolicy.create({
      data: rawRow({ tenantId, scopeId: "some-other-id", effectiveFrom: new Date("2029-01-01"), fingerprint: "h5" }),
    })).rejects.toThrow();
  });

  it("the database's CHECK constraint rejects an unrecognized rounding direction", async () => {
    const tenantId = await freshTenant();
    await expect(prisma.attendancePolicy.create({
      data: rawRow({ tenantId, scopeId: tenantId, effectiveFrom: new Date("2029-01-01"), roundingDirection: "sideways", fingerprint: "h6" }),
    })).rejects.toThrow();
  });

  it("the database's CHECK constraint rejects an uppercase rounding direction — only the lowercase approved values are valid", async () => {
    const tenantId = await freshTenant();
    await expect(prisma.attendancePolicy.create({
      data: rawRow({ tenantId, scopeId: tenantId, effectiveFrom: new Date("2029-01-01"), roundingDirection: "NEAREST", fingerprint: "h7" }),
    })).rejects.toThrow();
  });

  it("the database's CHECK constraint rejects a zero or negative rounding_interval_minutes", async () => {
    const tenantId = await freshTenant();
    await expect(prisma.attendancePolicy.create({
      data: rawRow({ tenantId, scopeId: tenantId, effectiveFrom: new Date("2029-01-01"), roundingIntervalMinutes: 0, fingerprint: "h8" }),
    })).rejects.toThrow();
  });

  it("the database accepts a rounding_interval_minutes that does not evenly divide 60 — no divisibility rule is authorized", async () => {
    const tenantId = await freshTenant();
    await expect(prisma.attendancePolicy.create({
      data: rawRow({ tenantId, scopeId: tenantId, effectiveFrom: new Date("2029-01-01"), roundingIntervalMinutes: 7, fingerprint: "h9" }),
    })).resolves.toBeDefined();
  });

  it("the database accepts NULL for the optional unpaid_break_minutes and daily_overtime_threshold_minutes columns", async () => {
    const tenantId = await freshTenant();
    const created = await prisma.attendancePolicy.create({
      data: rawRow({ tenantId, scopeId: tenantId, effectiveFrom: new Date("2029-01-01"), unpaidBreakMinutes: null, dailyOvertimeThresholdMinutes: null, fingerprint: "h10" }),
    });
    expect(created.unpaidBreakMinutes).toBeNull();
    expect(created.dailyOvertimeThresholdMinutes).toBeNull();
  });

  it("performs a real replace: ends the current policy and opens a new one in one transaction, forming adjacent windows", async () => {
    const tenantId = await freshTenant();
    const service = new AttendancePolicyService(new PrismaAttendancePolicyUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector()));
    const first = await service.createTenantPolicy(request(tenantId), content({ effectiveFrom: "2026-01-01T00:00:00.000Z" }));
    expect(first.kind).toBe("success");

    const replaced = await service.replaceTenantPolicy(request(tenantId), content({ effectiveFrom: "2026-06-01T00:00:00.000Z", roundingIntervalMinutes: 30, roundingDirection: "up" }));
    expect(replaced.kind).toBe("success");
    if (replaced.kind === "success") {
      expect(replaced.value.previous.effectiveUntil).toBe(replaced.value.policy.effectiveFrom);
      expect(replaced.value.policy.policyId).toBe(replaced.value.previous.policyId);
    }

    const reader = new PrismaAttendancePolicyReadRepository(prisma);
    const current = await reader.findCurrentPolicy(readContext(tenantId), "TENANT", tenantId);
    expect(current?.roundingIntervalMinutes).toBe(30);
    expect(current?.roundingDirection).toBe("up");
    const history = await reader.listPolicyHistory(readContext(tenantId), "TENANT", tenantId);
    expect(history).toHaveLength(2);
  });

  it("keeps attendance policies strictly tenant-isolated in reads and resolution", async () => {
    const tenantA = await freshTenant();
    const tenantB = await freshTenant();
    const service = new AttendancePolicyService(new PrismaAttendancePolicyUnitOfWork(prisma, new InMemoryDomainEventCollector(), new InMemoryAuditCollector()));
    await service.createTenantPolicy(request(tenantA), content());

    const reader = new PrismaAttendancePolicyReadRepository(prisma);
    expect(await reader.findCurrentPolicy(readContext(tenantA), "TENANT", tenantA)).toBeDefined();
    expect(await reader.findCurrentPolicy(readContext(tenantB), "TENANT", tenantB)).toBeUndefined();

    const resolver = new BaselineAttendancePolicyResolver(reader);
    const resolvedA = await resolver.resolve(readContext(tenantA), { tenantId: tenantA, personId: "p1", attendanceAnchorInstant: "2026-06-01T00:00:00.000Z" });
    expect(resolvedA.kind).toBe("resolved");
    const resolvedB = await resolver.resolve(readContext(tenantB), { tenantId: tenantB, personId: "p1", attendanceAnchorInstant: "2026-06-01T00:00:00.000Z" });
    expect(resolvedB.kind).toBe("configuration_incomplete");
  });
});
