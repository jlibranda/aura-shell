import type { TenantContext } from "@/platform/context";
import { getDevelopmentSession } from "@/platform/development-session";
import { AuthorizationError } from "@/platform/errors";
import { createPrismaPeopleReadRuntime, type PrismaPeopleReadRuntime } from "@/platform/people/prisma-people-read-runtime";
import type { EmployeeContactReadModel, EmployeeProfileReadModel } from "@/platform/people/read-models/people-read-models";
import type { EmployeeProfileReadRepository } from "@/platform/people/read-models/employee-profile-read-repository";
import type { OrganizationSummaryDto } from "@/platform/organization/organization-reference-dtos";
import type { OrganizationReferenceService } from "@/platform/organization/organization-reference-service";

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

export function toProfileOverviewViewModel(
  profile: EmployeeProfileReadModel,
): ProfileOverviewViewModel {
  return {
    employeeId: profile.id,
    employeeNumber: profile.employeeNumber,
    displayName: profile.displayName,
    employmentStatus: profile.status,
    position: profile.position,
    location: profile.location,
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
    location: profile.location,
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
    location: profile.location,
    hireDate: profile.hireDate,
    regularizationDate: profile.regularizationDate,
  };
}

async function loadOrganizationReferences(
  references: OrganizationReferenceService,
  context: TenantContext,
  profile: EmployeeProfileReadModel,
): Promise<OrganizationSummaryDto> {
  try {
    return await references.resolveSummary(context, {
      departmentId: profile.departmentId,
      teamId: profile.teamId,
      managerId: profile.managerId,
    });
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
  runtime: Pick<PrismaPeopleReadRuntime, "context" | "profiles" | "organizationReferences">,
  employeeId: string,
): Promise<RuntimeProfilePageResult> {
  try {
    const profile = await runtime.profiles.findProfile(runtime.context, employeeId);
    if (!profile) return { kind: "not_found" };
    const [contactInformation, organization] = await Promise.all([
      loadContact(runtime.profiles, runtime.context, employeeId),
      loadOrganizationReferences(runtime.organizationReferences, runtime.context, profile),
    ]);
    return {
      kind: "ready",
      overview: toProfileOverviewViewModel(profile),
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
  try {
    return await aggregateRuntimeProfile(
      createPrismaPeopleReadRuntime(getDevelopmentSession()),
      employeeId,
    );
  } catch {
    return { kind: "unavailable" };
  }
}
