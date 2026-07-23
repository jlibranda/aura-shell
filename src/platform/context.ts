export type PlatformRole = "hr_admin" | "hr_operations" | "payroll" | "manager" | "employee" | "auditor";
export type Permission = "people.read" | "people.write" | "people.government_ids.read" | "people.employee.hire";

/** Immutable representation resolved by a trusted server-side identity adapter. */
export class PermissionSet {
  private readonly values: ReadonlySet<Permission>;
  constructor(permissions: readonly Permission[]) {
    this.values = new Set(permissions);
    Object.freeze(this);
  }
  has(permission: Permission): boolean { return this.values.has(permission); }
  toArray(): Permission[] { return [...this.values]; }
}

export interface TenantContext {
  tenantId: string;
  actorId: string;
  actorName: string;
  roles: readonly PlatformRole[];
  permissions: PermissionSet;
  correlationId: string;
  authenticationMethod: string;
  actorProvenance: "server_verified" | "development_adapter";
}
export function hasPermission(context: TenantContext, permission: Permission): boolean { return context.roles.includes("hr_admin") || context.roles.includes("hr_operations") || (permission === "people.government_ids.read" && context.roles.includes("payroll")); }
