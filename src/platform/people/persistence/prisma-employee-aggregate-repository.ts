import { randomUUID } from "node:crypto";
import type { Employee } from "@prisma/client";
import { createEmployeeCreatedEvent } from "@/platform/people/events/employee-created-event";
import { EmployeeAggregateRoot } from "@/platform/people/persistence/employee-aggregate-root";
import type {
  EmployeeAggregate,
  EmployeeAggregateDraft,
  EmployeeAggregateRepository,
  EmployeeAggregateWriteContext,
  EmployeeAggregateWriteResult,
} from "@/platform/people/persistence/employee-aggregate-repository";
import type { PrismaEmployeePersistenceClient } from "@/platform/people/persistence/prisma-persistence-types";
import { ServerEventIdGenerator, type DomainEvent, type DomainEventClock, type EventIdGenerator } from "@/platform/events/domain-event";
import type { UnitOfWorkTransactionContext } from "@/platform/transactions/unit-of-work";

export interface EmployeeAggregateIdentifierGenerator {
  nextEmployeeId(): string;
  nextEmployeeNumber(): string;
}

/** Server-owned identifiers. A future database sequence may replace the number strategy. */
export class ServerEmployeeAggregateIdentifierGenerator implements EmployeeAggregateIdentifierGenerator {
  nextEmployeeId(): string { return randomUUID(); }
  nextEmployeeNumber(): string { return `EMP-${randomUUID().replaceAll("-", "").slice(0, 12).toUpperCase()}`; }
}

const systemClock: DomainEventClock = { now: () => new Date().toISOString() };
const requiredDate = (value: string): Date => new Date(`${value}T00:00:00.000Z`);
const nullable = (value: string): string | null => value.trim() === "" ? null : value;
const optional = (value: string | null): string => value ?? "";

function mapEmployee(employee: Employee): EmployeeAggregate {
  return Object.freeze({
    id: employee.employeeId,
    tenantId: employee.tenantId,
    employeeNumber: employee.employeeNumber,
    displayName: employee.displayName,
    personal: Object.freeze({
      firstName: employee.firstName,
      middleName: optional(employee.middleName),
      lastName: employee.lastName,
      preferredName: optional(employee.preferredName),
      dateOfBirth: employee.dateOfBirth.toISOString().slice(0, 10),
      gender: employee.gender,
      maritalStatus: employee.maritalStatus,
      nationality: employee.nationality,
    }),
    contact: Object.freeze({
      personalEmail: optional(employee.personalEmail),
      workEmail: employee.workEmail,
      mobileNumber: employee.mobileNumber,
      homeAddress: employee.homeAddress,
    }),
    employment: Object.freeze({
      departmentId: employee.departmentId,
      teamId: optional(employee.teamId),
      position: employee.position,
      managerId: optional(employee.managerId),
      employmentType: employee.employmentType,
      hireDate: employee.hireDate.toISOString().slice(0, 10),
      workLocation: employee.workLocation,
    }),
    emergencyContact: Object.freeze({
      name: optional(employee.emergencyContactName),
      relationship: optional(employee.emergencyRelationship),
      mobileNumber: optional(employee.emergencyMobileNumber),
      email: optional(employee.emergencyEmail),
      address: optional(employee.emergencyAddress),
    }),
    createdAt: employee.createdAt.toISOString(),
    updatedAt: employee.updatedAt.toISOString(),
  });
}

const isUniqueViolation = (error: unknown): boolean =>
  typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";

/**
 * Durable employee repository adapter. It is server-only and is deliberately
 * not registered in the browser-facing application runtime in Slice 6H1.
 */
export class PrismaEmployeeAggregateRepository implements EmployeeAggregateRepository {
  constructor(
    private readonly prisma: PrismaEmployeePersistenceClient,
    private readonly identifiers: EmployeeAggregateIdentifierGenerator = new ServerEmployeeAggregateIdentifierGenerator(),
  ) {}

  async create(context: EmployeeAggregateWriteContext, value: EmployeeAggregateDraft): Promise<EmployeeAggregateWriteResult> {
    const workEmail = value.contact.workEmail.trim().toLowerCase();
    const existing = await this.prisma.employee.findFirst({
      where: { tenantId: context.tenantId, workEmail },
      select: { employeeId: true },
    });
    if (existing) return Object.freeze({ kind: "conflict", field: "workEmail", message: "A work email already exists for this tenant." });

    await this.prisma.tenant.upsert({
      where: { id: context.tenantId },
      create: { id: context.tenantId },
      update: {},
    });

    try {
      const employee = await this.prisma.employee.create({
        data: {
          tenantId: context.tenantId,
          employeeId: this.identifiers.nextEmployeeId(),
          employeeNumber: this.identifiers.nextEmployeeNumber(),
          displayName: value.displayName,
          firstName: value.personal.firstName,
          middleName: nullable(value.personal.middleName),
          lastName: value.personal.lastName,
          preferredName: nullable(value.personal.preferredName),
          dateOfBirth: requiredDate(value.personal.dateOfBirth),
          gender: value.personal.gender,
          maritalStatus: value.personal.maritalStatus,
          nationality: value.personal.nationality,
          workEmail,
          personalEmail: nullable(value.contact.personalEmail),
          mobileNumber: value.contact.mobileNumber,
          homeAddress: value.contact.homeAddress,
          departmentId: value.employment.departmentId,
          teamId: nullable(value.employment.teamId),
          position: value.employment.position,
          managerId: nullable(value.employment.managerId),
          employmentType: value.employment.employmentType,
          hireDate: requiredDate(value.employment.hireDate),
          workLocation: value.employment.workLocation,
          emergencyContactName: nullable(value.emergencyContact.name),
          emergencyRelationship: nullable(value.emergencyContact.relationship),
          emergencyMobileNumber: nullable(value.emergencyContact.mobileNumber),
          emergencyEmail: nullable(value.emergencyContact.email),
          emergencyAddress: nullable(value.emergencyContact.address),
        },
      });
      return Object.freeze({ kind: "created", employee: mapEmployee(employee) });
    } catch (error) {
      if (isUniqueViolation(error)) return Object.freeze({ kind: "conflict", field: "workEmail", message: "A work email already exists for this tenant." });
      throw error;
    }
  }

  async list(context: EmployeeAggregateWriteContext): Promise<readonly EmployeeAggregate[]> {
    const employees = await this.prisma.employee.findMany({
      where: { tenantId: context.tenantId },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
    });
    return Object.freeze(employees.map(mapEmployee));
  }

  forTransaction(
    context: UnitOfWorkTransactionContext,
    eventIds: EventIdGenerator = new ServerEventIdGenerator(),
    eventClock: DomainEventClock = systemClock,
  ): PrismaEmployeeAggregateTransaction {
    return new PrismaEmployeeAggregateTransaction(this, context, eventIds, eventClock);
  }
}

/** Transaction-scoped repository with an internal event buffer. */
export class PrismaEmployeeAggregateTransaction implements EmployeeAggregateRepository {
  private readonly roots: EmployeeAggregateRoot[] = [];

  constructor(
    private readonly repository: PrismaEmployeeAggregateRepository,
    private readonly context: UnitOfWorkTransactionContext,
    private readonly eventIds: EventIdGenerator,
    private readonly eventClock: DomainEventClock,
  ) {}

  async create(context: EmployeeAggregateWriteContext, value: EmployeeAggregateDraft): Promise<EmployeeAggregateWriteResult> {
    this.assertTenant(context);
    const result = await this.repository.create(context, value);
    if (result.kind === "created") {
      const root = new EmployeeAggregateRoot(result.employee);
      root.record(createEmployeeCreatedEvent(result.employee, this.context, this.eventIds, this.eventClock));
      this.roots.push(root);
    }
    return result;
  }

  list(context: EmployeeAggregateWriteContext): Promise<readonly EmployeeAggregate[]> {
    this.assertTenant(context);
    return this.repository.list(context);
  }

  pullEvents(): readonly DomainEvent[] { return this.roots.flatMap((root) => root.pullEvents()); }
  clearEvents(): void { this.roots.forEach((root) => root.clearEvents()); }

  private assertTenant(context: EmployeeAggregateWriteContext): void {
    if (context.tenantId !== this.context.tenantId) {
      throw Object.freeze({ code: "TENANT_MISMATCH", message: "Transaction access must use its trusted tenant." });
    }
  }
}
