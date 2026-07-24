export type PlatformRole = "hr_admin" | "hr_operations" | "payroll" | "manager" | "employee" | "auditor";
export type Permission =
  | "people.read"
  | "people.write"
  | "people.government_ids.read"
  | "people.employee.hire"
  | "settings.view"
  | "settings.manage"
  | "settings.publish"
  | "settings.audit.view";

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
/**
 * Suggested initial access per Epic 7 Slice 7A: hr_admin gets full settings
 * access (view/manage/publish/audit); hr_operations can view and manage
 * drafts but not publish; payroll and auditor get view-only access (auditor
 * additionally sees the audit trail); manager and employee get no tenant
 * settings access by default. People permissions are unchanged from the
 * pre-existing coarse hr_admin/hr_operations(/payroll for government IDs) rule.
 */
const ROLE_PERMISSIONS: Readonly<Record<PlatformRole, readonly Permission[]>> = Object.freeze({
  hr_admin: ["people.read", "people.write", "people.government_ids.read", "people.employee.hire", "settings.view", "settings.manage", "settings.publish", "settings.audit.view"],
  hr_operations: ["people.read", "people.write", "people.government_ids.read", "people.employee.hire", "settings.view", "settings.manage"],
  payroll: ["people.government_ids.read", "settings.view"],
  auditor: ["settings.view", "settings.audit.view"],
  manager: [],
  employee: [],
});

export function hasPermission(context: TenantContext, permission: Permission): boolean {
  return context.roles.some((role) => ROLE_PERMISSIONS[role].includes(permission));
}
