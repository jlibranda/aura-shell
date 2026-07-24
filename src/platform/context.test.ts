import { describe, expect, it } from "vitest";
import { hasPermission, PermissionSet, type PlatformRole, type TenantContext } from "@/platform/context";

function contextFor(roles: readonly PlatformRole[]): TenantContext {
  return {
    tenantId: "tenant-a",
    actorId: "actor-a",
    actorName: "Actor A",
    roles,
    permissions: new PermissionSet([]),
    correlationId: "correlation-a",
    authenticationMethod: "test",
    actorProvenance: "server_verified",
  };
}

describe("hasPermission — pre-existing people.* behavior is unchanged", () => {
  it("grants people.read/write/hire to hr_admin and hr_operations, not payroll/manager/employee/auditor", () => {
    for (const permission of ["people.read", "people.write", "people.employee.hire"] as const) {
      expect(hasPermission(contextFor(["hr_admin"]), permission)).toBe(true);
      expect(hasPermission(contextFor(["hr_operations"]), permission)).toBe(true);
      expect(hasPermission(contextFor(["payroll"]), permission)).toBe(false);
      expect(hasPermission(contextFor(["manager"]), permission)).toBe(false);
      expect(hasPermission(contextFor(["employee"]), permission)).toBe(false);
      expect(hasPermission(contextFor(["auditor"]), permission)).toBe(false);
    }
  });

  it("grants people.government_ids.read to hr_admin, hr_operations, and payroll only", () => {
    expect(hasPermission(contextFor(["hr_admin"]), "people.government_ids.read")).toBe(true);
    expect(hasPermission(contextFor(["hr_operations"]), "people.government_ids.read")).toBe(true);
    expect(hasPermission(contextFor(["payroll"]), "people.government_ids.read")).toBe(true);
    expect(hasPermission(contextFor(["manager"]), "people.government_ids.read")).toBe(false);
    expect(hasPermission(contextFor(["employee"]), "people.government_ids.read")).toBe(false);
  });
});

describe("hasPermission — settings.* role matrix (Epic 7 Slice 7A)", () => {
  // Scenario 6: Manager cannot manage tenant settings by default.
  it("gives manager no settings access by default", () => {
    for (const permission of ["settings.view", "settings.manage", "settings.publish", "settings.audit.view"] as const) {
      expect(hasPermission(contextFor(["manager"]), permission)).toBe(false);
    }
  });

  // Scenario 5: Employee cannot open Settings.
  it("gives employee no settings access by default", () => {
    for (const permission of ["settings.view", "settings.manage", "settings.publish", "settings.audit.view"] as const) {
      expect(hasPermission(contextFor(["employee"]), permission)).toBe(false);
    }
  });

  // Scenario 8 + 9: HR Admin can create/manage a draft and publish.
  it("gives hr_admin full settings access: view, manage, publish, and audit view", () => {
    const context = contextFor(["hr_admin"]);
    expect(hasPermission(context, "settings.view")).toBe(true);
    expect(hasPermission(context, "settings.manage")).toBe(true);
    expect(hasPermission(context, "settings.publish")).toBe(true);
    expect(hasPermission(context, "settings.audit.view")).toBe(true);
  });

  // Scenario 7 + 9: HR Operations can view/manage drafts but not publish.
  it("gives hr_operations view and manage, but not publish or audit view", () => {
    const context = contextFor(["hr_operations"]);
    expect(hasPermission(context, "settings.view")).toBe(true);
    expect(hasPermission(context, "settings.manage")).toBe(true);
    expect(hasPermission(context, "settings.publish")).toBe(false);
    expect(hasPermission(context, "settings.audit.view")).toBe(false);
  });

  it("gives payroll view-only settings access", () => {
    const context = contextFor(["payroll"]);
    expect(hasPermission(context, "settings.view")).toBe(true);
    expect(hasPermission(context, "settings.manage")).toBe(false);
    expect(hasPermission(context, "settings.publish")).toBe(false);
    expect(hasPermission(context, "settings.audit.view")).toBe(false);
  });

  // Scenario 10: Auditor has read-only access (view + audit view, no edit/publish).
  it("gives auditor view and audit view, but no manage or publish", () => {
    const context = contextFor(["auditor"]);
    expect(hasPermission(context, "settings.view")).toBe(true);
    expect(hasPermission(context, "settings.audit.view")).toBe(true);
    expect(hasPermission(context, "settings.manage")).toBe(false);
    expect(hasPermission(context, "settings.publish")).toBe(false);
  });
});
