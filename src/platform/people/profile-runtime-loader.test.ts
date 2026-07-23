import { describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/platform/errors";
import type { EmployeeProfileDto } from "@/platform/people/application/people-dtos";
import type { PrismaPeopleReadRuntime } from "@/platform/people/prisma-people-read-runtime";
import type { EmployeeProfileReadRepository } from "@/platform/people/read-models/employee-profile-read-repository";
import type { OrganizationReferenceService } from "@/platform/organization/organization-reference-service";
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

function runtime(overrides: Partial<EmployeeProfileReadRepository> = {}, organizationOverrides: Partial<OrganizationReferenceService> = {}) {
  const profiles = {
    findProfile: vi.fn().mockResolvedValue(profile),
    findContact: vi.fn().mockResolvedValue({ id: "emp-1", workEmail: "ana@work.example" }),
    ...overrides,
  } as unknown as EmployeeProfileReadRepository;
  const organizationReferences = {
    resolveSummary: vi.fn().mockResolvedValue({
      department: { id: "finance", displayName: "Finance", type: "department" },
      team: { id: "planning", displayName: "Financial Planning", type: "team" },
      manager: { id: "emp-2", displayName: "Maria Santos", type: "manager" },
    }),
    ...organizationOverrides,
  } as unknown as OrganizationReferenceService;
  return {
    context: {
      tenantId: "tenant-secret",
      actorId: "user-secret",
      roles: ["hr_admin"],
      permissions: ["people.read"],
    },
    profiles,
    organizationReferences,
  } as unknown as Pick<PrismaPeopleReadRuntime, "context" | "profiles" | "organizationReferences">;
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
    expect(app.organizationReferences.resolveSummary).toHaveBeenCalledOnce();
  });

  it("keeps Work Information safe when organization resolution fails", async () => {
    const app = runtime({}, { resolveSummary: vi.fn().mockRejectedValue(new Error("offline")) });
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
