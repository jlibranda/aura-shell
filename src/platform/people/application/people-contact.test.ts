import { describe, expect, it } from "vitest";
import { PermissionSet } from "@/platform/context";
import { InMemoryAuditRepository } from "@/platform/audit";
import { AuthorizationError } from "@/platform/errors";
import { PeopleApplicationService } from "@/platform/people/application/people-service";
import { InMemoryEmployeeRepository } from "@/platform/people/in-memory-employee-repository";

describe("People contact query", () => { const context = (roles: "hr_admin"[] | "employee"[]) => ({ tenantId: "nw-ph", actorId: "user", actorName: "User", roles, permissions: new PermissionSet(["people.read"]), correlationId: "test-request", authenticationMethod: "test", actorProvenance: "server_verified" as const }); it("returns only profile-safe work contact data", async () => { const service = new PeopleApplicationService(new InMemoryEmployeeRepository(), new InMemoryAuditRepository()); const contact = await service.getContact(context(["hr_admin"]), "emp-2001"); expect(contact.workEmail).toContain("@"); expect(contact).not.toHaveProperty("mobile"); }); it("requires people read permission", async () => { const service = new PeopleApplicationService(new InMemoryEmployeeRepository(), new InMemoryAuditRepository()); await expect(service.getContact(context(["employee"]), "emp-2001")).rejects.toBeInstanceOf(AuthorizationError); }); });
