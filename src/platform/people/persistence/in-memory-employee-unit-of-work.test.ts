import { describe, expect, it } from "vitest";
import { InMemoryEmployeeAggregateRepository } from "@/platform/people/persistence/in-memory-employee-aggregate-repository";
import { InMemoryEmployeeUnitOfWork } from "@/platform/people/persistence/in-memory-employee-unit-of-work";

const context = Object.freeze({ tenantId: "tenant-a", correlationId: "correlation-transaction-1" });
const draft = (workEmail = "ana@work.example") => ({
  displayName: "Ana Domingo",
  personal: { firstName: "Ana", middleName: "", lastName: "Domingo", preferredName: "", dateOfBirth: "1994-02-01", gender: "female", maritalStatus: "single", nationality: "Filipino" },
  contact: { personalEmail: "", workEmail, mobileNumber: "+63 917 000 0000", homeAddress: "" },
  employment: { departmentId: "dep-1", teamId: "", position: "Analyst", managerId: "", employmentType: "regular", hireDate: "2024-02-01", workLocation: "Manila" },
  emergencyContact: { name: "", relationship: "", mobileNumber: "", email: "", address: "" },
});

describe("in-memory employee Unit of Work", () => {
  it("stages writes until successful work commits and propagates the correlation ID", async () => {
    const repository = new InMemoryEmployeeAggregateRepository({ now: () => "2026-07-23T00:00:00.000Z" });
    const unitOfWork = new InMemoryEmployeeUnitOfWork(repository);

    await unitOfWork.execute(context, async (transaction) => {
      expect(transaction.context.correlationId).toBe("correlation-transaction-1");
      await transaction.repositories.employees.create({ tenantId: context.tenantId }, draft());
      await expect(repository.list({ tenantId: context.tenantId })).resolves.toEqual([]);
      await expect(transaction.repositories.employees.list({ tenantId: context.tenantId })).resolves.toHaveLength(1);
    });

    await expect(repository.list({ tenantId: context.tenantId })).resolves.toHaveLength(1);
  });

  it("rolls back all staged writes when work fails", async () => {
    const repository = new InMemoryEmployeeAggregateRepository();
    const unitOfWork = new InMemoryEmployeeUnitOfWork(repository);

    await expect(unitOfWork.execute(context, async (transaction) => {
      await transaction.repositories.employees.create({ tenantId: context.tenantId }, draft());
      throw new Error("simulated failure after staging");
    })).rejects.toThrow("simulated failure after staging");

    await expect(repository.list({ tenantId: context.tenantId })).resolves.toEqual([]);
  });

  it("rolls back earlier staged writes when a later conflict aborts the operation", async () => {
    const repository = new InMemoryEmployeeAggregateRepository();
    const unitOfWork = new InMemoryEmployeeUnitOfWork(repository);

    await expect(unitOfWork.execute(context, async (transaction) => {
      await transaction.repositories.employees.create({ tenantId: context.tenantId }, draft());
      const duplicate = await transaction.repositories.employees.create({ tenantId: context.tenantId }, draft("ANA@WORK.EXAMPLE"));
      if (duplicate.kind === "conflict") throw new Error("duplicate work email");
    })).rejects.toThrow("duplicate work email");

    await expect(repository.list({ tenantId: context.tenantId })).resolves.toEqual([]);
  });

  it("isolates transaction access by its trusted tenant and closes completed transactions", async () => {
    const repository = new InMemoryEmployeeAggregateRepository();
    const transaction = repository.beginTransaction(context);

    await expect(transaction.list({ tenantId: "tenant-b" })).rejects.toMatchObject({ code: "TENANT_MISMATCH" });
    await transaction.rollback();
    await expect(transaction.list({ tenantId: context.tenantId })).rejects.toMatchObject({ code: "TRANSACTION_CLOSED" });
  });
});
