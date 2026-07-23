import { describe, expect, it, vi } from "vitest";
import { AuthorizationError } from "@/platform/errors";
import { PermissionSet, type TenantContext } from "@/platform/context";
import { PrismaEmployeeProfileReadRepository, PrismaPeopleDirectoryReadRepository } from "@/platform/people/read-models/prisma-people-read-repositories";

const context: TenantContext = { tenantId: "nw-ph", actorId: "server", actorName: "Server", roles: ["hr_admin"], permissions: new PermissionSet(["people.read"]), correlationId: "request", authenticationMethod: "development", actorProvenance: "development_adapter" };
const row = { employeeId: "emp-2001", employeeNumber: "NW-2001", displayName: "Ana Domingo", workEmail: "ana.domingo@northwind.ph", departmentId: "dep-fin", teamId: null, managerId: "emp-2002", hireDate: new Date("2022-02-14T00:00:00.000Z"), position: "Financial Analyst", employmentStatus: "regular", workLocation: "Manila" };

function prisma(overrides: Record<string, unknown> = {}) {
  return { employee: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([row]), findUnique: vi.fn().mockResolvedValue(row), ...overrides } } as any;
}

describe("Prisma People read repositories", () => {
  it("maps only directory-safe fields from a tenant-scoped Prisma projection", async () => {
    const client = prisma();
    const result = await new PrismaPeopleDirectoryReadRepository(client).list(context, { offset: 0, limit: 25, query: "Ana" });
    expect(result.items).toEqual([{ id: "emp-2001", employeeNumber: "NW-2001", displayName: "Ana Domingo", workEmail: "ana.domingo@northwind.ph", departmentId: "dep-fin", managerId: "emp-2002", hireDate: "2022-02-14", position: "Financial Analyst", status: "regular" }]);
    expect(client.employee.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ tenantId: "nw-ph" }) }));
    expect(Object.keys((client.employee.findMany as ReturnType<typeof vi.fn>).mock.calls[0][0].select)).not.toContain("personalEmail");
  });

  it("uses a tenant-scoped composite key for profile and contact reads", async () => {
    const client = prisma();
    const repository = new PrismaEmployeeProfileReadRepository(client);
    await expect(repository.findProfile(context, "emp-2001")).resolves.toMatchObject({ id: "emp-2001", location: "Manila" });
    await expect(repository.findContact(context, "emp-2001")).resolves.toEqual({ id: "emp-2001", workEmail: "ana.domingo@northwind.ph" });
    expect(client.employee.findUnique).toHaveBeenNthCalledWith(1, expect.objectContaining({ where: { tenantId_employeeId: { tenantId: "nw-ph", employeeId: "emp-2001" } } }));
    expect(client.employee.findUnique).toHaveBeenNthCalledWith(2, expect.objectContaining({ where: { tenantId_employeeId: { tenantId: "nw-ph", employeeId: "emp-2001" } }, select: { employeeId: true, workEmail: true } }));
  });

  it("returns an explicit safe status when persistence has no status", async () => {
    const client = prisma({ findMany: vi.fn().mockResolvedValue([{ ...row, employmentStatus: null }]) });
    await expect(new PrismaPeopleDirectoryReadRepository(client).list(context, { offset: 0, limit: 25 })).resolves.toMatchObject({ items: [expect.objectContaining({ status: "not_available" })] });
  });

  it("returns undefined for missing rows without falling back to legacy data", async () => {
    const client = prisma({ findUnique: vi.fn().mockResolvedValue(null) });
    const repository = new PrismaEmployeeProfileReadRepository(client);
    await expect(repository.findProfile(context, "missing")).resolves.toBeUndefined();
    await expect(repository.findContact(context, "missing")).resolves.toBeUndefined();
  });

  it("enforces the trusted People read permission before querying", async () => {
    const denied: TenantContext = { ...context, roles: ["employee"] };
    const client = prisma();
    await expect(new PrismaPeopleDirectoryReadRepository(client).list(denied, { offset: 0, limit: 25 })).rejects.toBeInstanceOf(AuthorizationError);
    expect(client.employee.findMany).not.toHaveBeenCalled();
  });
});
