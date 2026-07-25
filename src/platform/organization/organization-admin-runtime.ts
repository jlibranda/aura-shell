import type { TenantContext } from "@/platform/context";
import { createPlatformContainer } from "@/platform/composition-root";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { AUDIT_COLLECTOR, DOMAIN_EVENT_COLLECTOR } from "@/platform/tokens";
import { createTenantContext, type TrustedRequestContext } from "@/platform/runtime-context";
import { OrganizationQueryService } from "@/platform/organization/organization-query-service";
import { OrgUnitService } from "@/platform/organization/org-unit-service";
import { LocationService } from "@/platform/organization/location-service";
import { AssignmentService } from "@/platform/organization/assignment-service";
import { PrismaOrgUnitUnitOfWork } from "@/platform/organization/prisma-org-unit-unit-of-work";
import { PrismaLocationUnitOfWork } from "@/platform/organization/prisma-location-unit-of-work";
import { PrismaAssignmentUnitOfWork } from "@/platform/organization/prisma-assignment-unit-of-work";
import { PrismaOrgUnitReadRepository } from "@/platform/organization/prisma-org-unit-read-repository";
import { PrismaLocationReadRepository } from "@/platform/organization/prisma-location-read-repository";
import { PrismaAssignmentReadRepository } from "@/platform/organization/prisma-assignment-read-repository";
import type { OrgUnitReadRepository } from "@/platform/organization/org-unit-repository";
import type { LocationReadRepository } from "@/platform/organization/location-repository";
import type { AssignmentReadRepository } from "@/platform/organization/assignment-repository";
import type { OrganizationEmployeeDirectory } from "@/platform/organization/organization-employee-directory";
import { PrismaOrganizationEmployeeDirectory } from "@/platform/organization/prisma-organization-employee-directory";

/**
 * Server-only trusted composition for Epic 7B.5's Settings > Organization
 * admin UI. Mirrors createDurableConfigurationRuntime's shape: one factory
 * built from a TrustedRequestContext, wiring the existing write services
 * (OrgUnitService, LocationService, AssignmentService — unchanged from
 * 7B.1-7B.3) and the existing read surface (OrganizationQueryService,
 * EmployeeDisplayLookup — unchanged from 7B.4) rather than any new
 * aggregate or duplicate domain logic. Never imported from a client
 * component (see the architecture fitness rule alongside it).
 */
export interface OrganizationAdminRuntime {
  readonly context: TenantContext;
  readonly queries: OrganizationQueryService;
  readonly orgUnits: { readonly read: OrgUnitReadRepository; readonly service: OrgUnitService };
  readonly locations: { readonly read: LocationReadRepository; readonly service: LocationService };
  readonly assignments: { readonly read: AssignmentReadRepository; readonly service: AssignmentService };
  readonly employees: OrganizationEmployeeDirectory;
}

export function createOrganizationAdminRuntime(request: TrustedRequestContext): OrganizationAdminRuntime {
  const prisma = getPrismaClient();
  const scope = createPlatformContainer().createScope();
  const eventCollector = scope.resolve(DOMAIN_EVENT_COLLECTOR);
  const auditCollector = scope.resolve(AUDIT_COLLECTOR);

  const orgUnitRead = new PrismaOrgUnitReadRepository(prisma);
  const locationRead = new PrismaLocationReadRepository(prisma);
  const assignmentRead = new PrismaAssignmentReadRepository(prisma);

  return Object.freeze({
    context: createTenantContext(request),
    queries: new OrganizationQueryService(assignmentRead, orgUnitRead, locationRead),
    orgUnits: Object.freeze({
      read: orgUnitRead,
      service: new OrgUnitService(new PrismaOrgUnitUnitOfWork(prisma, eventCollector, auditCollector)),
    }),
    locations: Object.freeze({
      read: locationRead,
      service: new LocationService(new PrismaLocationUnitOfWork(prisma, eventCollector, auditCollector)),
    }),
    assignments: Object.freeze({
      read: assignmentRead,
      service: new AssignmentService(new PrismaAssignmentUnitOfWork(prisma, eventCollector, auditCollector)),
    }),
    employees: new PrismaOrganizationEmployeeDirectory(prisma),
  });
}
