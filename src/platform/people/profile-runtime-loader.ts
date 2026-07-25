import type { TenantContext } from "@/platform/context";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { AuthorizationError } from "@/platform/errors";
import { createPrismaPeopleReadRuntime, type PrismaPeopleReadRuntime } from "@/platform/people/prisma-people-read-runtime";
import type { EmployeeContactReadModel, EmployeeProfileReadModel } from "@/platform/people/read-models/people-read-models";
import type { EmployeeProfileReadRepository } from "@/platform/people/read-models/employee-profile-read-repository";
import type { OrganizationSummaryDto } from "@/platform/organization/organization-reference-dtos";
import type { OrganizationPlacementService } from "@/platform/people/read-models/organization-placement-service";

export interface ProfileOverviewViewModel {
  employeeId: string;
  employeeNumber: string;
  displayName: string;
  employmentStatus: EmployeeProfileReadModel["status"];
  position: string;
  location: string;
  hireDate: string;
  regularizationDate?: string;
}

export interface ProfileWorkInformationViewModel {
  employeeNumber: string;
  position: string;
  employmentStatus: EmployeeProfileReadModel["status"];
  department?: string;
  team?: string;
  manager?: string;
  location: string;
  hireDate: string;
  regularizationDate?: string;
}

/**
 * A deliberately separate boundary for the restored Employment tab. It has no
 * compensation, history, government-ID, or personal-contact data.
 */
export interface ProfileEmploymentViewModel {
  employeeNumber: string;
  position: string;
  employmentStatus: EmployeeProfileReadModel["status"];
  department?: string;
  team?: string;
  manager?: string;
  location: string;
  hireDate: string;
  regularizationDate?: string;
}

export interface ProfileContactInformationViewModel {
  workEmail: string;
}

export type ContactInformationResult =
  | { kind: "ready"; contact: ProfileContactInformationViewModel }
  | { kind: "unauthorized" }
  | { kind: "unavailable" };

export type RuntimeProfilePageResult =
  | {
      kind: "ready";
      overview: ProfileOverviewViewModel;
      workInformation: ProfileWorkInformationViewModel;
      employment: ProfileEmploymentViewModel;
      contactInformation: ContactInformationResult;
    }
  | { kind: "not_found" }
  | { kind: "unauthorized" }
  | { kind: "unavailable" };

/**
 * The authoritative work Location for display: Assignment.locationId (via
 * OrganizationPlacementService, resolved against real Location master data)
 * when the placement has one, falling back to the profile's legacy
 * free-text location field only when it doesn't. Every screen that
 * displays a "Location" field must go through this — never read
 * profile.location directly on its own — so Employment, Work Information,
 * and Overview can never disagree about where an employee is located. The
 * legacy fallback is isolated here so it can be deleted in one place once
 * Location assignment is fully rolled out and the legacy field is retired.
 */
function resolveDisplayLocation(profile: EmployeeProfileReadModel, organization: OrganizationSummaryDto): string {
  return organization.location?.displayName ?? profile.location;
}

export function toProfileOverviewViewModel(
  profile: EmployeeProfileReadModel,
  organization: OrganizationSummaryDto = {},
): ProfileOverviewViewModel {
  return {
    employeeId: profile.id,
    employeeNumber: profile.employeeNumber,
    displayName: profile.displayName,
    employmentStatus: profile.status,
    position: profile.position,
    location: resolveDisplayLocation(profile, organization),
    hireDate: profile.hireDate,
    regularizationDate: profile.regularizationDate,
  };
}

export function toProfileWorkInformationViewModel(
  profile: EmployeeProfileReadModel,
  organization: OrganizationSummaryDto = {},
): ProfileWorkInformationViewModel {
  return {
    employeeNumber: profile.employeeNumber,
    position: profile.position,
    employmentStatus: profile.status,
    department: organization.department?.displayName,
    team: organization.team?.displayName,
    manager: organization.manager?.displayName,
    location: resolveDisplayLocation(profile, organization),
    hireDate: profile.hireDate,
    regularizationDate: profile.regularizationDate,
  };
}

export function toProfileEmploymentViewModel(
  profile: EmployeeProfileReadModel,
  organization: OrganizationSummaryDto = {},
): ProfileEmploymentViewModel {
  return {
    employeeNumber: profile.employeeNumber,
    position: profile.position,
    employmentStatus: profile.status,
    department: organization.department?.displayName,
    team: organization.team?.displayName,
    manager: organization.manager?.displayName,
    location: resolveDisplayLocation(profile, organization),
    hireDate: profile.hireDate,
    regularizationDate: profile.regularizationDate,
  };
}

async function loadOrganizationPlacement(
  organizationPlacements: OrganizationPlacementService,
  context: TenantContext,
  profile: EmployeeProfileReadModel,
): Promise<OrganizationSummaryDto> {
  try {
    return await organizationPlacements.resolvePlacementSummary(context, profile.id);
  } catch {
    return {};
  }
}

export function toProfileContactInformationViewModel(
  contact: EmployeeContactReadModel,
): ProfileContactInformationViewModel {
  return { workEmail: contact.workEmail };
}

async function loadContact(
  profiles: EmployeeProfileReadRepository,
  context: TenantContext,
  employeeId: string,
): Promise<ContactInformationResult> {
  try {
    const contact = await profiles.findContact(context, employeeId);
    if (!contact || contact.id !== employeeId) return { kind: "unavailable" };
    return {
      kind: "ready",
      contact: toProfileContactInformationViewModel(contact),
    };
  } catch (error) {
    if (error instanceof AuthorizationError) return { kind: "unauthorized" };
    return { kind: "unavailable" };
  }
}

export async function aggregateRuntimeProfile(
  runtime: Pick<PrismaPeopleReadRuntime, "context" | "profiles" | "organizationPlacements">,
  employeeId: string,
): Promise<RuntimeProfilePageResult> {
  try {
    const profile = await runtime.profiles.findProfile(runtime.context, employeeId);
    if (!profile) return { kind: "not_found" };
    const [contactInformation, organization] = await Promise.all([
      loadContact(runtime.profiles, runtime.context, employeeId),
      loadOrganizationPlacement(runtime.organizationPlacements, runtime.context, profile),
    ]);
    return {
      kind: "ready",
      overview: toProfileOverviewViewModel(profile, organization),
      workInformation: toProfileWorkInformationViewModel(profile, organization),
      employment: toProfileEmploymentViewModel(profile, organization),
      contactInformation,
    };
  } catch (error) {
    if (error instanceof AuthorizationError) return { kind: "unauthorized" };
    return { kind: "unavailable" };
  }
}

export async function loadRuntimeProfile(
  employeeId: string,
): Promise<RuntimeProfilePageResult> {
  // Resolved outside the try/catch below: an unauthenticated production
  // request must redirect() to /login, and that redirect works by throwing —
  // a catch-all here would otherwise swallow it into "unavailable".
  const context = await resolveRequestContext();
  try {
    return await aggregateRuntimeProfile(
      createPrismaPeopleReadRuntime(context),
      employeeId,
    );
  } catch {
    return { kind: "unavailable" };
  }
}
