import { describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/platform/errors";
import type { EmployeeProfileDto } from "@/platform/people/application/people-dtos";
import type { PrismaPeopleReadRuntime } from "@/platform/people/prisma-people-read-runtime";
import type { EmployeeProfileReadRepository } from "@/platform/people/read-models/employee-profile-read-repository";
import type { OrganizationPlacementService } from "@/platform/people/read-models/organization-placement-service";
import {
  aggregateRuntimeProfile,
  toProfileContactInformationViewModel,
  toProfileEmploymentViewModel,
  toProfileOverviewViewModel,
  toProfileWorkInformationViewModel,
} from "@/platform/people/profile-runtime-loader";

const profile: EmployeeProfileDto = {
  id: "emp-1",
  employeeNumber: "NW-1",
  displayName: "Ana Domingo",
  status: "regular",
  position: "Analyst",
  departmentId: "finance",
  teamId: "planning",
  managerId: "emp-2",
  location: "Manila",
  hireDate: "2022-01-01",
  regularizationDate: "2022-07-01",
};

function runtime(overrides: Partial<EmployeeProfileReadRepository> = {}, organizationOverrides: Partial<OrganizationPlacementService> = {}) {
  const profiles = {
    findProfile: vi.fn().mockResolvedValue(profile),
    findContact: vi.fn().mockResolvedValue({ id: "emp-1", workEmail: "ana@work.example" }),
    ...overrides,
  } as unknown as EmployeeProfileReadRepository;
  const organizationPlacements = {
    resolvePlacementSummary: vi.fn().mockResolvedValue({
      department: { id: "finance", displayName: "Finance", type: "department" },
      team: { id: "planning", displayName: "Financial Planning", type: "team" },
      manager: { id: "emp-2", displayName: "Maria Santos", type: "manager" },
    }),
    ...organizationOverrides,
  } as unknown as OrganizationPlacementService;
  return {
    context: {
      tenantId: "tenant-secret",
      actorId: "user-secret",
      roles: ["hr_admin"],
      permissions: ["people.read"],
    },
    profiles,
    organizationPlacements,
  } as unknown as Pick<PrismaPeopleReadRuntime, "context" | "profiles" | "organizationPlacements">;
}

describe("runtime profile view models", () => {
  it("maps the Overview boundary", () => {
    expect(toProfileOverviewViewModel(profile)).toEqual({
      employeeId: "emp-1",
      employeeNumber: "NW-1",
      displayName: "Ana Domingo",
      employmentStatus: "regular",
      position: "Analyst",
      location: "Manila",
      hireDate: "2022-01-01",
      regularizationDate: "2022-07-01",
    });
  });

  it("maps the Work Information boundary", () => {
    expect(toProfileWorkInformationViewModel(profile, {
      department: { id: "finance", displayName: "Finance", type: "department" },
      team: { id: "planning", displayName: "Financial Planning", type: "team" },
      manager: { id: "emp-2", displayName: "Maria Santos", type: "manager" },
    })).toEqual({
      employeeNumber: "NW-1",
      position: "Analyst",
      employmentStatus: "regular",
      department: "Finance",
      team: "Financial Planning",
      manager: "Maria Santos",
      location: "Manila",
      hireDate: "2022-01-01",
      regularizationDate: "2022-07-01",
    });
  });

  it("maps the Contact Information boundary", () => {
    expect(toProfileContactInformationViewModel({
      id: "emp-1",
      workEmail: "ana@work.example",
    })).toEqual({ workEmail: "ana@work.example" });
  });

  it("maps the Employment boundary from profile and verified organization labels", () => {
    expect(toProfileEmploymentViewModel(profile, {
      department: { id: "finance", displayName: "Finance", type: "department" },
      team: { id: "planning", displayName: "Financial Planning", type: "team" },
      manager: { id: "emp-2", displayName: "Maria Santos", type: "manager" },
    })).toEqual({
      employeeNumber: "NW-1",
      position: "Analyst",
      employmentStatus: "regular",
      department: "Finance",
      team: "Financial Planning",
      manager: "Maria Santos",
      location: "Manila",
      hireDate: "2022-01-01",
      regularizationDate: "2022-07-01",
    });
  });

  it("excludes sensitive and unrelated fields from every tab model", () => {
    const values = [
      toProfileOverviewViewModel(profile),
      toProfileWorkInformationViewModel(profile),
      toProfileEmploymentViewModel(profile),
      toProfileContactInformationViewModel({ id: "emp-1", workEmail: "ana@work.example" }),
    ];
    for (const value of values) {
      for (const key of ["governmentIds", "mobile", "phone", "personalEmail", "address", "emergencyContacts", "compensation"]) {
        expect(value).not.toHaveProperty(key);
      }
    }
  });

  it("Employment prefers the Assignment-resolved location over the legacy Employee.workLocation when both are present", () => {
    const result = toProfileEmploymentViewModel(profile, { location: { id: "loc-1", displayName: "Manila HQ", type: "location" } });
    expect(result.location).toBe("Manila HQ");
    expect(result.location).not.toBe(profile.location);
  });

  it("Work Information prefers the Assignment-resolved location over the legacy Employee.workLocation when both are present", () => {
    const result = toProfileWorkInformationViewModel(profile, { location: { id: "loc-1", displayName: "Manila HQ", type: "location" } });
    expect(result.location).toBe("Manila HQ");
    expect(result.location).not.toBe(profile.location);
  });

  it("falls back to the legacy Employee.workLocation on every tab when there is no Assignment-resolved location yet", () => {
    expect(toProfileOverviewViewModel(profile, {}).location).toBe(profile.location);
    expect(toProfileWorkInformationViewModel(profile, {}).location).toBe(profile.location);
    expect(toProfileEmploymentViewModel(profile, {}).location).toBe(profile.location);
  });

  it("Employment and Work Information never disagree about location — same source, same value, for the same organization summary", () => {
    const organization = { location: { id: "loc-1", displayName: "Manila HQ", type: "location" as const } };
    expect(toProfileEmploymentViewModel(profile, organization).location).toBe(toProfileWorkInformationViewModel(profile, organization).location);
  });

  it("keeps tab boundaries narrow and non-overlapping", () => {
    expect(Object.keys(toProfileOverviewViewModel(profile))).toEqual([
      "employeeId", "employeeNumber", "displayName", "employmentStatus", "position", "location", "hireDate", "regularizationDate",
    ]);
    expect(Object.keys(toProfileWorkInformationViewModel(profile, {}))).toEqual([
      "employeeNumber", "position", "employmentStatus", "department", "team", "manager", "location", "hireDate", "regularizationDate",
    ]);
    expect(Object.keys(toProfileContactInformationViewModel({ id: "emp-1", workEmail: "ana@work.example" }))).toEqual(["workEmail"]);
    expect(Object.keys(toProfileEmploymentViewModel(profile, {}))).toEqual([
      "employeeNumber", "position", "employmentStatus", "department", "team", "manager", "location", "hireDate", "regularizationDate",
    ]);
  });
});

describe("runtime profile aggregation", () => {
  it("aggregates profile once and contact independently", async () => {
    const app = runtime();
    const result = await aggregateRuntimeProfile(app, "emp-1");
    expect(result.kind).toBe("ready");
    expect(app.profiles.findProfile).toHaveBeenCalledOnce();
    expect(app.profiles.findContact).toHaveBeenCalledOnce();
    expect(app.organizationPlacements.resolvePlacementSummary).toHaveBeenCalledOnce();
  });

  it("threads the Assignment-resolved location from organizationPlacements through to Overview, Work Information, and Employment alike", async () => {
    const app = runtime({}, {
      resolvePlacementSummary: vi.fn().mockResolvedValue({
        manager: { id: "emp-2", displayName: "Maria Santos", type: "manager" },
        location: { id: "loc-1", displayName: "Manila HQ", type: "location" },
      }),
    });
    const result = await aggregateRuntimeProfile(app, "emp-1");
    expect(result).toMatchObject({
      kind: "ready",
      overview: { location: "Manila HQ" },
      workInformation: { location: "Manila HQ" },
      employment: { location: "Manila HQ" },
    });
  });

  it("keeps Work Information safe when organization resolution fails", async () => {
    const app = runtime({}, { resolvePlacementSummary: vi.fn().mockRejectedValue(new Error("offline")) });
    const result = await aggregateRuntimeProfile(app, "emp-1");
    expect(result).toMatchObject({ kind: "ready", workInformation: { department: undefined, team: undefined, manager: undefined } });
  });

  it("preserves Overview and Work Information when contact is unavailable", async () => {
    const app = runtime({ findContact: vi.fn().mockRejectedValue(new Error("offline")) });
    const result = await aggregateRuntimeProfile(app, "emp-1");
    expect(result).toMatchObject({
      kind: "ready",
      overview: { employeeId: "emp-1" },
      workInformation: { employeeNumber: "NW-1" },
      employment: { employeeNumber: "NW-1", manager: "Maria Santos" },
      contactInformation: { kind: "unavailable" },
    });
  });

  it("returns safe page-level not-found and unauthorized states", async () => {
    const missing = runtime({ findProfile: vi.fn().mockResolvedValue(undefined) });
    const denied = runtime({ findProfile: vi.fn().mockRejectedValue(new AuthorizationError()) });
    await expect(aggregateRuntimeProfile(missing, "emp-404")).resolves.toEqual({ kind: "not_found" });
    await expect(aggregateRuntimeProfile(denied, "emp-1")).resolves.toEqual({ kind: "unauthorized" });
    expect(missing.profiles.findContact).not.toHaveBeenCalled();
    expect(denied.profiles.findContact).not.toHaveBeenCalled();
  });

  it("does not leak tenant, session, permissions, roles, or raw Employee data", async () => {
    const result = await aggregateRuntimeProfile(runtime(), "emp-1");
    const serialized = JSON.stringify(result);
    for (const secret of ["tenant-secret", "user-secret", "hr_admin", "people.read", "\"personal\":", "governmentIds", "compensation"]) {
      expect(serialized).not.toContain(secret);
    }
  });
});
