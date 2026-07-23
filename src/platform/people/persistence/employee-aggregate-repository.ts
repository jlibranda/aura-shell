export type EmployeeAggregateWriteContext = Readonly<{ tenantId: string }>;
export type EmployeeAggregateTransactionContext = Readonly<{ tenantId: string; correlationId: string }>;

export type EmployeeAggregateDraft = Readonly<{
  displayName: string;
  personal: Readonly<{ firstName: string; middleName: string; lastName: string; preferredName: string; dateOfBirth: string; gender: string; maritalStatus: string; nationality: string }>;
  contact: Readonly<{ personalEmail: string; workEmail: string; mobileNumber: string; homeAddress: string }>;
  employment: Readonly<{ departmentId: string; teamId: string; position: string; managerId: string; employmentType: string; hireDate: string; workLocation: string }>;
  emergencyContact: Readonly<{ name: string; relationship: string; mobileNumber: string; email: string; address: string }>;
}>;

export type EmployeeAggregate = Readonly<EmployeeAggregateDraft & {
  id: string;
  tenantId: string;
  employeeNumber: string;
  createdAt: string;
  updatedAt: string;
}>;

export type EmployeeAggregateWriteResult =
  | Readonly<{ kind: "created"; employee: EmployeeAggregate }>
  | Readonly<{ kind: "conflict"; field: "workEmail"; message: string }>;

/** Write port for the new employee aggregate. It deliberately has no legacy Employee dependency. */
export interface EmployeeAggregateRepository {
  create(context: EmployeeAggregateWriteContext, draft: EmployeeAggregateDraft): Promise<EmployeeAggregateWriteResult>;
  list(context: EmployeeAggregateWriteContext): Promise<readonly EmployeeAggregate[]>;
}

/** Transaction-scoped write port. Its lifecycle is controlled by a Unit of Work. */
export interface EmployeeAggregateRepositoryTransaction extends EmployeeAggregateRepository {
  commit(): Promise<void>;
  rollback(): Promise<void>;
  pullEvents(): readonly import("@/platform/events/domain-event").DomainEvent[];
  clearEvents(): void;
}

export interface TransactionalEmployeeAggregateRepository extends EmployeeAggregateRepository {
  beginTransaction(context: EmployeeAggregateTransactionContext): EmployeeAggregateRepositoryTransaction;
}
