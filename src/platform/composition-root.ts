import { InMemoryAuditRepository } from "@/platform/audit";
import { InMemoryAuditCollector } from "@/platform/auditing/audit-collector";
import { AuditRecordFactory } from "@/platform/auditing/audit-record-factory";
import { ServerAuditIdGenerator } from "@/platform/auditing/audit-record";
import { InMemoryDomainEventCollector } from "@/platform/events/domain-event-collector";
import { ServiceContainer } from "@/platform/di";
import { AUDIT_COLLECTOR, AUDIT_RECORD_FACTORY, AUDIT_REPOSITORY, DOMAIN_EVENT_COLLECTOR, EMPLOYEE_AGGREGATE_REPOSITORY, EMPLOYEE_REPOSITORY, EMPLOYEE_UNIT_OF_WORK, ORGANIZATION_REFERENCE_REPOSITORY, ORGANIZATION_REFERENCE_SERVICE, PEOPLE_SERVICE } from "@/platform/tokens";
import { InMemoryEmployeeRepository } from "@/platform/people/in-memory-employee-repository";
import { InMemoryEmployeeAggregateRepository } from "@/platform/people/persistence/in-memory-employee-aggregate-repository";
import { InMemoryEmployeeUnitOfWork } from "@/platform/people/persistence/in-memory-employee-unit-of-work";
import { PeopleApplicationService } from "@/platform/people/application/people-service";
import { InMemoryOrganizationReferenceRepository } from "@/platform/organization/organization-reference-repository";
import { OrganizationReferenceApplicationService } from "@/platform/organization/organization-reference-service";

export function createPlatformContainer(): ServiceContainer {
  const container = new ServiceContainer();
  container.registerSingleton(AUDIT_REPOSITORY, new InMemoryAuditRepository());
  container.registerSingleton(EMPLOYEE_REPOSITORY, new InMemoryEmployeeRepository());
  const employeeAggregates = new InMemoryEmployeeAggregateRepository();
  const domainEvents = new InMemoryDomainEventCollector();
  const audits = new InMemoryAuditCollector();
  const auditFactory = new AuditRecordFactory(new ServerAuditIdGenerator(), { now: () => new Date().toISOString() });
  container.registerSingleton(EMPLOYEE_AGGREGATE_REPOSITORY, employeeAggregates);
  container.registerSingleton(DOMAIN_EVENT_COLLECTOR, domainEvents);
  container.registerSingleton(AUDIT_COLLECTOR, audits);
  container.registerSingleton(AUDIT_RECORD_FACTORY, auditFactory);
  container.registerSingleton(EMPLOYEE_UNIT_OF_WORK, new InMemoryEmployeeUnitOfWork(employeeAggregates, domainEvents, audits, auditFactory));
  container.registerSingleton(ORGANIZATION_REFERENCE_REPOSITORY, new InMemoryOrganizationReferenceRepository());
  container.registerFactory(PEOPLE_SERVICE, (scope) => new PeopleApplicationService(scope.resolve(EMPLOYEE_REPOSITORY), scope.resolve(AUDIT_REPOSITORY)));
  container.registerFactory(ORGANIZATION_REFERENCE_SERVICE, (scope) => new OrganizationReferenceApplicationService(scope.resolve(ORGANIZATION_REFERENCE_REPOSITORY)));
  return container;
}
