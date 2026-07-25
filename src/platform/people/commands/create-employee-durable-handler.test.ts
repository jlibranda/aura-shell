import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import { InMemoryEmployeeAggregateRepository } from "@/platform/people/persistence/in-memory-employee-aggregate-repository";
import type { PrismaEmployeeTransactionRepositories } from "@/platform/people/persistence/prisma-employee-unit-of-work";
import { InMemoryAssignmentWriteRepository, AssignmentStore } from "@/platform/organization/in-memory-assignment-repository";
import { InMemoryOrgUnitWriteRepository, OrgUnitStore } from "@/platform/organization/in-memory-org-unit-repository";
import { InMemoryLocationWriteRepository, LocationStore } from "@/platform/organization/in-memory-location-repository";
import { InMemoryLegalEntityWriteRepository, LegalEntityStore } from "@/platform/organization/in-memory-legal-entity-repository";
import { InMemoryPersonExistenceRepository } from "@/platform/organization/in-memory-person-existence-repository";
import type { AssignmentWriteRepository } from "@/platform/organization/assignment-repository";
import { createCreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";
import { CreateEmployeeDurableHandler } from "@/platform/people/commands/create-employee-durable-handler";
import { createTrustedRequestContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { UnitOfWork, UnitOfWorkContext, UnitOfWorkTransaction } from "@/platform/transactions/unit-of-work";

function request(tenantId = "tenant-a"): TrustedRequestContext {
  return createTrustedRequestContext({
    principal: { subjectId: "s-1", userId: "user-1", tenantId, authenticationMethod: "test", authenticatedAt: "2026-01-01T00:00:00.000Z" },
    roles: ["hr_admin"], permissions: ["people.employee.hire"], actorProvenance: "server_verified", correlationId: "corr-1",
  });
}

function command(overrides: { legalEntityId?: string; orgUnitId?: string; locationId?: string; managerId?: string; hireDate?: string; workEmail?: string } = {}) {
  return createCreateEmployeeCommand({
    personal: { firstName: "Ana", middleName: "", lastName: "Domingo", preferredName: "", dateOfBirth: "1994-02-01", gender: "female", maritalStatus: "single", nationality: "Filipino" },
    contact: { personalEmail: "", workEmail: overrides.workEmail ?? "ana@work.example", mobileNumber: "+63 917 000 0000", homeAddress: "" },
    employment: { legalEntityId: overrides.legalEntityId ?? "le1", orgUnitId: overrides.orgUnitId ?? "ou1", locationId: overrides.locationId ?? "loc1", position: "Analyst", managerId: overrides.managerId ?? "", employmentType: "regular", hireDate: overrides.hireDate ?? "2026-07-25" },
    emergencyContact: { name: "", relationship: "", mobileNumber: "", email: "", address: "" },
  });
}

/** In-memory transaction coordinator mirroring PrismaEmployeeUnitOfWork's shape, for testing CreateEmployeeDurableHandler without a real database. Optionally injects a throwing assignments repository to exercise the rollback path. */
class TestDurableUnitOfWork implements UnitOfWork<PrismaEmployeeTransactionRepositories> {
  readonly employeeAggregates = new InMemoryEmployeeAggregateRepository();
  readonly assignmentStore = new AssignmentStore();
  readonly orgUnitStore = new OrgUnitStore();
  readonly locationStore = new LocationStore();
  readonly legalEntityStore = new LegalEntityStore();
  readonly people = new InMemoryPersonExistenceRepository();

  constructor(private readonly failAssignmentCreationWith?: Error) {}

  async execute<TResult>(
    context: UnitOfWorkContext,
    operation: (transaction: UnitOfWorkTransaction<PrismaEmployeeTransactionRepositories>) => Promise<TResult>,
  ): Promise<TResult> {
    const transactionContext = Object.freeze({ ...context, transactionId: randomUUID() });
    const employees = this.employeeAggregates.beginTransaction(transactionContext);
    const inner = new InMemoryAssignmentWriteRepository(this.assignmentStore);
    const failure = this.failAssignmentCreationWith;
    const assignments: AssignmentWriteRepository = failure
      ? {
          findById: (...args) => inner.findById(...args),
          listForPerson: (...args) => inner.listForPerson(...args),
          findCurrentPrimaryForPerson: (...args) => inner.findCurrentPrimaryForPerson(...args),
          end: (...args) => inner.end(...args),
          create: async () => { throw failure; },
        }
      : inner;
    const repositories = Object.freeze({
      employees,
      assignments,
      orgUnits: new InMemoryOrgUnitWriteRepository(this.orgUnitStore),
      locations: new InMemoryLocationWriteRepository(this.locationStore),
      legalEntities: new InMemoryLegalEntityWriteRepository(this.legalEntityStore),
      people: this.people,
    });
    try {
      const result = await operation({ context: transactionContext, repositories });
      await employees.commit();
      return result;
    } catch (error) {
      await employees.rollback();
      throw error;
    }
  }
}

function harness(failAssignmentCreationWith?: Error) {
  const unitOfWork = new TestDurableUnitOfWork(failAssignmentCreationWith);
  const handler = new CreateEmployeeDurableHandler(unitOfWork);
  unitOfWork.legalEntityStore.legalEntities.push(Object.freeze({
    id: "le1", tenantId: "tenant-a", code: "LE1", legalName: "Acme Corp", countryCode: "PH", status: "ACTIVE" as const,
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
  }));
  unitOfWork.orgUnitStore.units.push(Object.freeze({
    id: "ou1", tenantId: "tenant-a", legalEntityId: "le1", code: "OU1", name: "Engineering", kind: "DEPARTMENT" as const, status: "ACTIVE" as const,
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
  }));
  unitOfWork.orgUnitStore.units.push(Object.freeze({
    id: "ou-archived", tenantId: "tenant-a", legalEntityId: "le1", code: "OUA", name: "Legacy Unit", kind: "DEPARTMENT" as const, status: "ARCHIVED" as const,
    createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
  }));
  unitOfWork.locationStore.locations.push(Object.freeze({
    id: "loc1", tenantId: "tenant-a", code: "LOC1", name: "Manila HQ",
    address: { line1: "1 Main St", city: "Manila" }, countryCode: "PH", timezone: "Asia/Manila",
    status: "ACTIVE" as const, createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
  }));
  unitOfWork.locationStore.locations.push(Object.freeze({
    id: "loc-archived", tenantId: "tenant-a", code: "LOCA", name: "Closed Office",
    address: { line1: "2 Main St", city: "Manila" }, countryCode: "PH", timezone: "Asia/Manila",
    status: "ARCHIVED" as const, createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
  }));
  unitOfWork.people.add("tenant-a", "mgr-1");
  return { handler, unitOfWork };
}

describe("CreateEmployeeDurableHandler — initial Assignment creation", () => {
  it("creates the employee and an initial primary Assignment with orgUnitId, locationId, and managerId, in one command", async () => {
    const { handler, unitOfWork } = harness();
    const result = await handler.execute(request(), command({ managerId: "mgr-1" }));
    expect(result.kind).toBe("success");
    if (result.kind === "success") {
      expect(result.value.employee.employment.departmentId).toBe("ou1"); // legacy compatibility placeholder, not authoritative
      expect(result.value.assignment.legalEntityId).toBe("le1");
      expect(result.value.assignment.orgUnitId).toBe("ou1");
      expect(result.value.assignment.locationId).toBe("loc1");
      expect(result.value.assignment.managerId).toBe("mgr-1");
      expect(result.value.assignment.personId).toBe(result.value.employee.id);
      expect(result.value.assignment.isPrimary).toBe(true);
    }
    expect(unitOfWork.assignmentStore.assignments).toHaveLength(1);
  });

  it("uses the hire date as the Assignment's effectiveFrom", async () => {
    const { handler } = harness();
    const result = await handler.execute(request(), command({ hireDate: "2026-09-01" }));
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.assignment.effectiveFrom).toBe("2026-09-01");
  });

  it("creates an Assignment even without a manager — manager is optional", async () => {
    const { handler } = harness();
    const result = await handler.execute(request(), command());
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.assignment.managerId).toBeUndefined();
  });

  it("does not write anything to the legacy Employee.workLocation field for a new hire", async () => {
    const { handler } = harness();
    const result = await handler.execute(request(), command());
    expect(result.kind).toBe("success");
    if (result.kind === "success") expect(result.value.employee.employment.workLocation).toBeNull();
  });
});

describe("CreateEmployeeDurableHandler — placement validation", () => {
  it("rejects a nonexistent organization unit and creates neither the employee nor an Assignment", async () => {
    const { handler, unitOfWork } = harness();
    const result = await handler.execute(request(), command({ orgUnitId: "ghost-ou" }));
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "employment.orgUnitId" && i.code === "not_found")).toBe(true);
    expect((await unitOfWork.employeeAggregates.list({ tenantId: "tenant-a" }))).toHaveLength(0);
    expect(unitOfWork.assignmentStore.assignments).toHaveLength(0);
  });

  it("rejects an archived organization unit", async () => {
    const { handler } = harness();
    const result = await handler.execute(request(), command({ orgUnitId: "ou-archived" }));
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "employment.orgUnitId" && i.code === "archived")).toBe(true);
  });

  it("rejects a nonexistent location", async () => {
    const { handler } = harness();
    const result = await handler.execute(request(), command({ locationId: "ghost-loc" }));
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "employment.locationId" && i.code === "not_found")).toBe(true);
  });

  it("rejects an archived location", async () => {
    const { handler } = harness();
    const result = await handler.execute(request(), command({ locationId: "loc-archived" }));
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "employment.locationId" && i.code === "archived")).toBe(true);
  });

  it("rejects a nonexistent manager", async () => {
    const { handler } = harness();
    const result = await handler.execute(request(), command({ managerId: "ghost-manager" }));
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "employment.managerId" && i.code === "not_found")).toBe(true);
  });

  it("does not let tenant B reference tenant A's organization unit or location", async () => {
    const { handler } = harness();
    const result = await handler.execute(request("tenant-b"), command());
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "employment.orgUnitId")).toBe(true);
  });
});

describe("CreateEmployeeDurableHandler — Legal Entity placement validation (ADR-013 §3)", () => {
  it("rejects a nonexistent legal entity", async () => {
    const { handler, unitOfWork } = harness();
    // A dedicated org unit whose own legalEntityId points at a legal entity that was never seeded — isolates "legal entity does not exist" from the cross-entity mismatch check, which would otherwise trip first.
    unitOfWork.orgUnitStore.units.push(Object.freeze({
      id: "ou-ghost-entity", tenantId: "tenant-a", legalEntityId: "ghost-le", code: "OUG", name: "Orphaned Unit", kind: "DEPARTMENT" as const, status: "ACTIVE" as const,
      createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const result = await handler.execute(request(), command({ legalEntityId: "ghost-le", orgUnitId: "ou-ghost-entity" }));
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "employment.legalEntityId" && i.code === "not_found")).toBe(true);
    expect((await unitOfWork.employeeAggregates.list({ tenantId: "tenant-a" }))).toHaveLength(0);
    expect(unitOfWork.assignmentStore.assignments).toHaveLength(0);
  });

  it("rejects an archived legal entity", async () => {
    const { handler, unitOfWork } = harness();
    unitOfWork.legalEntityStore.legalEntities[0] = Object.freeze({ ...unitOfWork.legalEntityStore.legalEntities[0], status: "ARCHIVED" as const });
    const result = await handler.execute(request(), command());
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "employment.legalEntityId" && i.code === "archived")).toBe(true);
  });

  it("rejects an organization unit that does not belong to the selected legal entity (cross-entity OrgUnit rejected server-side)", async () => {
    const { handler, unitOfWork } = harness();
    unitOfWork.legalEntityStore.legalEntities.push(Object.freeze({
      id: "le2", tenantId: "tenant-a", code: "LE2", legalName: "Beta Corp", countryCode: "PH", status: "ACTIVE" as const,
      createdAt: "2026-01-01T00:00:00.000Z", createdBy: "actor", updatedAt: "2026-01-01T00:00:00.000Z",
    }));
    const result = await handler.execute(request(), command({ legalEntityId: "le2" }));
    expect(result.kind).toBe("validation_failure");
    if (result.kind === "validation_failure") expect(result.issues.some((i) => i.path.join(".") === "employment.orgUnitId" && i.code === "cross_entity")).toBe(true);
    expect((await unitOfWork.employeeAggregates.list({ tenantId: "tenant-a" }))).toHaveLength(0);
  });
});

describe("CreateEmployeeDurableHandler — atomicity", () => {
  it("rolls back the employee creation when Assignment creation fails", async () => {
    const { handler, unitOfWork } = harness(new Error("simulated Assignment write failure"));
    await expect(handler.execute(request(), command())).rejects.toThrow("simulated Assignment write failure");
    expect(await unitOfWork.employeeAggregates.list({ tenantId: "tenant-a" })).toHaveLength(0);
  });
});

describe("CreateEmployeeDurableHandler — audit and outbox", () => {
  it("buffers both an EmployeeCreated and an AssignmentAssigned event for one hire", async () => {
    const { handler, unitOfWork } = harness();
    await handler.execute(request(), command({ managerId: "mgr-1" }));
    // Verified indirectly: PrismaEmployeeUnitOfWork.execute pulls employees.pullEvents() concatenated with assignments.pullEvents() — here we assert the two write paths each recorded exactly one row, which is what backs those two events.
    expect(await unitOfWork.employeeAggregates.list({ tenantId: "tenant-a" })).toHaveLength(1);
    expect(unitOfWork.assignmentStore.assignments).toHaveLength(1);
  });
});

describe("AuditRecordFactory branching by aggregateType (used by PrismaEmployeeUnitOfWork.createAuditRecords)", () => {
  it("audits an employee event and an assignment event distinctly, both attributable to the same hire command", () => {
    // PrismaEmployeeUnitOfWork.createAuditRecords branches on event.aggregateType to call the right factory method for each of the two events one hire now produces — exercised end-to-end (real Prisma mock) in durable-application-runtime.test.ts; this checks the branching inputs/outputs directly.
    const factory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => "2026-07-25T00:00:00.000Z" });
    const context = { tenantId: "t", actorUserId: "u", requestId: "r", correlationId: "c", transactionId: "tx", commandName: "CreateEmployee" };
    const employeeAudit = factory.employeeCreated(context, { eventId: "e1", eventName: "people.employee.created", aggregateType: "employee", aggregateId: "emp-1", occurredAt: "2026-07-25T00:00:00.000Z", tenantId: "t", correlationId: "c", requestId: "r", version: 1, payload: {} });
    const assignmentAudit = factory.organizationEvent(context, { eventId: "e2", eventName: "organization.assignment.assigned", aggregateType: "assignment", aggregateId: "a-1", occurredAt: "2026-07-25T00:00:00.000Z", tenantId: "t", correlationId: "c", requestId: "r", version: 1, payload: {} });
    expect(employeeAudit.eventName).toBe("people.employee.created");
    expect(assignmentAudit.eventName).toBe("organization.assignment.assigned");
    expect(employeeAudit.transactionId).toBe(assignmentAudit.transactionId);
  });
});
