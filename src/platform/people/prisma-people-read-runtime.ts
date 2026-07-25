import type { TenantContext } from "@/platform/context";
import { OrganizationQueryService } from "@/platform/organization/organization-query-service";
import { PrismaAssignmentReadRepository } from "@/platform/organization/prisma-assignment-read-repository";
import { PrismaOrgUnitReadRepository } from "@/platform/organization/prisma-org-unit-read-repository";
import { PrismaLocationReadRepository } from "@/platform/organization/prisma-location-read-repository";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import type { EmployeeProfileReadRepository } from "@/platform/people/read-models/employee-profile-read-repository";
import { PrismaEmployeeProfileReadRepository, PrismaPeopleDirectoryReadRepository } from "@/platform/people/read-models/prisma-people-read-repositories";
import type { PeopleDirectoryReadRepository } from "@/platform/people/read-models/people-directory-read-repository";
import type { OrganizationPlacementService } from "@/platform/people/read-models/organization-placement-service";
import { PrismaOrganizationPlacementService } from "@/platform/people/read-models/prisma-organization-placement-service";
import { PrismaEmployeeDisplayLookup } from "@/platform/people/read-models/prisma-employee-display-lookup";
import type { TrustedRequestContext } from "@/platform/runtime-context";
import { createTenantContext } from "@/platform/runtime-context";

export interface PrismaPeopleReadRuntime {
  readonly context: TenantContext;
  readonly directory: PeopleDirectoryReadRepository;
  readonly profiles: EmployeeProfileReadRepository;
  readonly organizationPlacements: OrganizationPlacementService;
}

/**
 * Request-local durable read composition. It deliberately exposes no command,
 * aggregate repository, raw Employee model, or write capability.
 */
export function createPrismaPeopleReadRuntime(request: TrustedRequestContext): PrismaPeopleReadRuntime {
  const prisma = getPrismaClient();
  const organizationQuery = new OrganizationQueryService(
    new PrismaAssignmentReadRepository(prisma),
    new PrismaOrgUnitReadRepository(prisma),
    new PrismaLocationReadRepository(prisma),
  );
  return Object.freeze({
    context: createTenantContext(request),
    directory: new PrismaPeopleDirectoryReadRepository(prisma),
    profiles: new PrismaEmployeeProfileReadRepository(prisma),
    organizationPlacements: new PrismaOrganizationPlacementService(organizationQuery, new PrismaEmployeeDisplayLookup(prisma)),
  });
}
