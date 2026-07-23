import type { TenantContext } from "@/platform/context";
import { InMemoryOrganizationReferenceRepository } from "@/platform/organization/organization-reference-repository";
import { OrganizationReferenceApplicationService, type OrganizationReferenceService } from "@/platform/organization/organization-reference-service";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import type { EmployeeProfileReadRepository } from "@/platform/people/read-models/employee-profile-read-repository";
import { PrismaEmployeeProfileReadRepository, PrismaPeopleDirectoryReadRepository } from "@/platform/people/read-models/prisma-people-read-repositories";
import type { PeopleDirectoryReadRepository } from "@/platform/people/read-models/people-directory-read-repository";
import type { TrustedRequestContext } from "@/platform/runtime-context";
import { createTenantContext } from "@/platform/runtime-context";

export interface PrismaPeopleReadRuntime {
  readonly context: TenantContext;
  readonly directory: PeopleDirectoryReadRepository;
  readonly profiles: EmployeeProfileReadRepository;
  readonly organizationReferences: OrganizationReferenceService;
}

/**
 * Request-local durable read composition. It deliberately exposes no command,
 * aggregate repository, raw Employee model, or write capability.
 */
export function createPrismaPeopleReadRuntime(request: TrustedRequestContext): PrismaPeopleReadRuntime {
  const prisma = getPrismaClient();
  return Object.freeze({
    context: createTenantContext(request),
    directory: new PrismaPeopleDirectoryReadRepository(prisma),
    profiles: new PrismaEmployeeProfileReadRepository(prisma),
    organizationReferences: new OrganizationReferenceApplicationService(new InMemoryOrganizationReferenceRepository()),
  });
}
