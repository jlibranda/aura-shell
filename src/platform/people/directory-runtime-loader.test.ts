import { describe, expect, it, vi } from "vitest";
import type { ApplicationRuntime } from "@/platform/application-runtime";
import type { EmployeeDirectoryDto } from "@/platform/people/application/people-dtos";
import { resolveDirectoryRows, toPeopleDirectoryRow } from "@/platform/people/directory-runtime-loader";

const employee: EmployeeDirectoryDto = { id: "emp-1", employeeNumber: "NW-1", displayName: "Ana Domingo", workEmail: "ana@northwind.ph", departmentId: "dep-fin", teamId: "team-fin", hireDate: "2022-01-01", position: "Analyst", status: "regular", managerId: "emp-2" };

describe("People directory runtime row mapping", () => {
  it("maps explicit safe fields and verified organization labels only", () => {
    const row = toPeopleDirectoryRow(employee, {
      department: { id: "dep-fin", displayName: "Finance", type: "department" },
      manager: { id: "emp-2", displayName: "Maria Santos", type: "manager" },
    });
    expect(row).toEqual({ employeeId: "emp-1", employeeNumber: "NW-1", displayName: "Ana Domingo", workEmail: "ana@northwind.ph", position: "Analyst", employmentStatus: "regular", department: "Finance", manager: "Maria Santos", hireDate: "2022-01-01" });
  });

  it("does not expose raw organization IDs or sensitive directory exclusions", () => {
    const row = toPeopleDirectoryRow(employee);
    for (const key of ["departmentId", "teamId", "managerId", "governmentIds", "missingGovernmentIds", "tenantId", "compensation", "mobile"]) {
      expect(row).not.toHaveProperty(key);
    }
  });

  it("uses resolved references without failing the listing when organization lookup is unavailable", async () => {
    const organizationReferences = { resolveSummaries: vi.fn().mockRejectedValue(new Error("offline")) };
    const runtime = { context: { tenantId: "nw-ph", actorId: "hr", actorName: "HR", roles: ["hr_admin"] }, organizationReferences } as unknown as Pick<ApplicationRuntime, "context" | "organizationReferences">;
    await expect(resolveDirectoryRows(runtime, [employee])).resolves.toEqual([toPeopleDirectoryRow(employee)]);
  });

  it("passes only department and manager identifiers to the organization runtime", async () => {
    const organizationReferences = { resolveSummaries: vi.fn().mockResolvedValue([{ department: { id: "dep-fin", displayName: "Finance", type: "department" }, manager: { id: "emp-2", displayName: "Maria Santos", type: "manager" } }]) };
    const runtime = { context: { tenantId: "nw-ph", actorId: "hr", actorName: "HR", roles: ["hr_admin"] }, organizationReferences } as unknown as Pick<ApplicationRuntime, "context" | "organizationReferences">;
    await expect(resolveDirectoryRows(runtime, [employee])).resolves.toMatchObject([{ department: "Finance", manager: "Maria Santos" }]);
    expect(organizationReferences.resolveSummaries).toHaveBeenCalledWith(runtime.context, [{ departmentId: "dep-fin", managerId: "emp-2" }]);
  });
});
