import { describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/platform/errors";
import type { TenantContext } from "@/platform/context";
import { PermissionSet } from "@/platform/context";
import { OrganizationReferenceApplicationService } from "@/platform/organization/organization-reference-service";
import type { OrganizationReferenceRepository } from "@/platform/organization/organization-reference-repository";

const context: TenantContext = { tenantId: "tenant-a", actorId: "hr-1", actorName: "HR", roles: ["hr_admin"], permissions: new PermissionSet(["people.read"]), correlationId: "test-request", authenticationMethod: "test", actorProvenance: "server_verified" };
const records = [
  { id: "dep-1", displayName: "Finance", type: "department" as const, tenantId: "tenant-a" },
  { id: "team-1", displayName: "Planning", type: "team" as const, tenantId: "tenant-a" },
  { id: "emp-1", displayName: "Maria Santos", type: "manager" as const, tenantId: "tenant-a" },
];
const repository: OrganizationReferenceRepository = {
  async findById(requestContext, type, id) {
    const record = records.find((item) => item.tenantId === requestContext.tenantId && item.type === type && item.id === id);
    return record ? { ...record } : undefined;
  },
  async list(requestContext, type) {
    return records.filter((item) => item.tenantId === requestContext.tenantId && item.type === type).map((item) => ({ ...item }));
  },
};

describe("organization reference runtime", () => {
  const service = new OrganizationReferenceApplicationService(repository);

  it("maps verified department, team, and manager labels", async () => {
    await expect(service.resolveSummary(context, { departmentId: "dep-1", teamId: "team-1", managerId: "emp-1" })).resolves.toEqual({
      department: { id: "dep-1", displayName: "Finance", type: "department" },
      team: { id: "team-1", displayName: "Planning", type: "team" },
      manager: { id: "emp-1", displayName: "Maria Santos", type: "manager" },
    });
  });

  it("returns no reference for missing or tenant-isolated records", async () => {
    await expect(service.resolve(context, "department", "missing")).resolves.toBeUndefined();
    await expect(service.resolve({ ...context, tenantId: "tenant-b" }, "department", "dep-1")).resolves.toBeUndefined();
  });

  it("requires People read authorization", async () => {
    await expect(service.resolve({ ...context, roles: ["employee"] }, "department", "dep-1")).rejects.toBeInstanceOf(AuthorizationError);
  });

  it("returns only the public display DTO boundary", async () => {
    const result = await service.resolve(context, "manager", "emp-1");
    expect(result).toEqual({ id: "emp-1", displayName: "Maria Santos", type: "manager" });
    expect(result).not.toHaveProperty("tenantId");
  });

  it("lists tenant-isolated selectable references without repository records", async () => {
    await expect(service.list(context, "department")).resolves.toEqual([{ id: "dep-1", displayName: "Finance", type: "department" }]);
    await expect(service.list({ ...context, tenantId: "tenant-b" }, "department")).resolves.toEqual([]);
  });

  it("batches repeated references without repeated repository lookups", async () => {
    const findById = vi.fn(repository.findById);
    const batched = new OrganizationReferenceApplicationService({ findById, list: repository.list });
    await batched.resolveSummaries(context, [
      { departmentId: "dep-1", managerId: "emp-1" },
      { departmentId: "dep-1", managerId: "emp-1" },
    ]);
    expect(findById).toHaveBeenCalledTimes(2);
  });
});
