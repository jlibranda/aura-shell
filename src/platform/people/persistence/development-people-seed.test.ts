import { describe, expect, it, vi } from "vitest";
import { seedDevelopmentPeople } from "@/platform/people/persistence/development-people-seed";
import type { DevelopmentPeopleSeedClient } from "@/platform/people/persistence/development-people-seed";

function database(existingCount = 0, matchingCount = existingCount) {
  const employee = { count: vi.fn().mockResolvedValueOnce(existingCount).mockResolvedValueOnce(matchingCount), createMany: vi.fn().mockResolvedValue({ count: 48 }) };
  const tenant = { upsert: vi.fn().mockResolvedValue({ id: "nw-ph" }) };
  const client: DevelopmentPeopleSeedClient = { $transaction: async (operation) => operation({ employee, tenant } as never) };
  return { client, employee, tenant };
}

describe("controlled development People seed", () => {
  it("inserts exactly the approved fixture set into an empty database", async () => {
    const target = database();
    await expect(seedDevelopmentPeople(target.client, { AURA_SEED_ENV: "development" })).resolves.toEqual({ state: "seeded", employeeCount: 48 });
    expect(target.tenant.upsert).toHaveBeenCalledTimes(1);
    expect(target.employee.createMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.arrayContaining([expect.objectContaining({ tenantId: "nw-ph", employeeId: "emp-2001", workEmail: "ana.domingo@northwind.ph" })]) }));
    const rows = target.employee.createMany.mock.calls[0]?.[0].data as readonly Record<string, unknown>[];
    expect(rows).toHaveLength(48);
    for (const row of rows) {
      expect(row).not.toHaveProperty("governmentIds");
      expect(row).not.toHaveProperty("compensation");
      expect(row.personalEmail).toBeNull();
      expect(row.mobileNumber).toBe("");
      expect(row.homeAddress).toBe("");
      expect(row.emergencyContactName).toBeNull();
    }
  });

  it("is idempotent for exactly the approved fixture set and never overwrites rows", async () => {
    const target = database(48, 48);
    await expect(seedDevelopmentPeople(target.client, { AURA_SEED_ENV: "development" })).resolves.toEqual({ state: "already_seeded", employeeCount: 48 });
    expect(target.tenant.upsert).not.toHaveBeenCalled();
    expect(target.employee.createMany).not.toHaveBeenCalled();
  });

  it("refuses populated non-fixture databases and production execution", async () => {
    await expect(seedDevelopmentPeople(database(1, 1).client, { AURA_SEED_ENV: "development" })).rejects.toThrow("never overwrites");
    await expect(seedDevelopmentPeople(database().client, { AURA_SEED_ENV: "development", NODE_ENV: "production" })).rejects.toThrow("blocked");
    await expect(seedDevelopmentPeople(database().client, {})).rejects.toThrow("blocked");
  });
});
