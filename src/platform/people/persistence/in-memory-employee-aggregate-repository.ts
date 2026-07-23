import { ApplicationError } from "@/platform/errors";
import { ServerEventIdGenerator, type EventIdGenerator } from "@/platform/events/domain-event";
import { createEmployeeCreatedEvent } from "@/platform/people/events/employee-created-event";
import { EmployeeAggregateRoot } from "@/platform/people/persistence/employee-aggregate-root";
import type { EmployeeAggregate, EmployeeAggregateDraft, EmployeeAggregateRepositoryTransaction, EmployeeAggregateTransactionContext, EmployeeAggregateWriteContext, EmployeeAggregateWriteResult, TransactionalEmployeeAggregateRepository } from "@/platform/people/persistence/employee-aggregate-repository";

const clone = <T,>(value: T): T => structuredClone(value);
const freeze = <T,>(value: T): T => {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    for (const child of Object.values(value as Record<string, unknown>)) freeze(child);
    Object.freeze(value);
  }
  return value;
};
const tenantKey = (tenantId: string) => tenantId.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

export interface EmployeeAggregateClock {
  now(): string;
}

const serverClock: EmployeeAggregateClock = Object.freeze({
  now: () => new Date().toISOString(),
});

/** Deterministic test adapter only; it is not a production persistence implementation. */
export class InMemoryEmployeeAggregateRepository implements TransactionalEmployeeAggregateRepository {
  private readonly recordsByTenant = new Map<string, EmployeeAggregate[]>();

  constructor(
    private readonly clock: EmployeeAggregateClock = serverClock,
    private readonly eventIds: EventIdGenerator = new ServerEventIdGenerator(),
  ) {}

  async create(context: EmployeeAggregateWriteContext, draft: EmployeeAggregateDraft): Promise<EmployeeAggregateWriteResult> {
    const result = this.createInRecords(context.tenantId, this.recordsByTenant.get(context.tenantId) ?? [], draft);
    if (result.kind === "created") this.recordsByTenant.set(context.tenantId, [...(this.recordsByTenant.get(context.tenantId) ?? []), result.employee]);
    return result;
  }

  async list(context: EmployeeAggregateWriteContext): Promise<readonly EmployeeAggregate[]> {
    return clone(this.recordsByTenant.get(context.tenantId) ?? []);
  }

  beginTransaction(context: EmployeeAggregateTransactionContext): EmployeeAggregateRepositoryTransaction {
    return new InMemoryEmployeeAggregateRepositoryTransaction(this, context, this.recordsByTenant.get(context.tenantId) ?? []);
  }

  createInRecords(tenantId: string, records: readonly EmployeeAggregate[], draft: EmployeeAggregateDraft): EmployeeAggregateWriteResult {
    const workEmail = draft.contact.workEmail.trim().toLowerCase();
    if (records.some((employee) => employee.contact.workEmail.trim().toLowerCase() === workEmail)) {
      return Object.freeze({ kind: "conflict" as const, field: "workEmail" as const, message: "A worker with this work email already exists in this tenant." });
    }
    const sequence = records.length + 1;
    const key = tenantKey(tenantId) || "tenant";
    const timestamp = this.clock.now();
    const employee = freeze({
      ...clone(draft),
      id: `${key}-employee-${String(sequence).padStart(4, "0")}`,
      tenantId,
      employeeNumber: `${key.toUpperCase()}-${String(sequence).padStart(4, "0")}`,
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    return Object.freeze({ kind: "created" as const, employee: clone(employee) });
  }

  commitRecords(tenantId: string, records: readonly EmployeeAggregate[]): void {
    this.recordsByTenant.set(tenantId, [...clone(records)]);
  }

  createCreatedEvent(employee: EmployeeAggregate, context: EmployeeAggregateTransactionContext) {
    return createEmployeeCreatedEvent(employee, context, this.eventIds, this.clock);
  }
}

class InMemoryEmployeeAggregateRepositoryTransaction implements EmployeeAggregateRepositoryTransaction {
  private lifecycle: "active" | "committed" | "rolled_back" = "active";
  private stagedRecords: EmployeeAggregate[];
  private readonly aggregates: EmployeeAggregateRoot[] = [];

  constructor(
    private readonly repository: InMemoryEmployeeAggregateRepository,
    private readonly context: EmployeeAggregateTransactionContext,
    initialRecords: readonly EmployeeAggregate[],
  ) {
    this.stagedRecords = [...clone(initialRecords)];
  }

  async create(context: EmployeeAggregateWriteContext, draft: EmployeeAggregateDraft): Promise<EmployeeAggregateWriteResult> {
    this.assertActive();
    this.assertTenant(context);
    const result = this.repository.createInRecords(this.context.tenantId, this.stagedRecords, draft);
    if (result.kind === "created") {
      const aggregate = new EmployeeAggregateRoot(result.employee);
      aggregate.record(this.repository.createCreatedEvent(result.employee, this.context));
      this.aggregates.push(aggregate);
      this.stagedRecords = [...this.stagedRecords, result.employee];
    }
    return result;
  }

  async list(context: EmployeeAggregateWriteContext): Promise<readonly EmployeeAggregate[]> {
    this.assertActive();
    this.assertTenant(context);
    return clone(this.stagedRecords);
  }

  async commit(): Promise<void> {
    this.assertActive();
    this.repository.commitRecords(this.context.tenantId, this.stagedRecords);
    this.lifecycle = "committed";
  }

  async rollback(): Promise<void> {
    this.assertActive();
    this.stagedRecords = [];
    this.clearEvents();
    this.lifecycle = "rolled_back";
  }

  pullEvents() {
    if (this.lifecycle === "rolled_back") return Object.freeze([]);
    return Object.freeze(this.aggregates.flatMap((aggregate) => aggregate.pullEvents()));
  }

  clearEvents(): void {
    for (const aggregate of this.aggregates) aggregate.clearEvents();
  }

  private assertActive(): void {
    if (this.lifecycle !== "active") throw new ApplicationError("TRANSACTION_CLOSED", "The transaction is no longer active.");
  }

  private assertTenant(context: EmployeeAggregateWriteContext): void {
    if (context.tenantId !== this.context.tenantId) throw new ApplicationError("TENANT_MISMATCH", "A transaction cannot access another tenant.");
  }
}
