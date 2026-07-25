/**
 * A minimal, read-only employee id/display-name listing, owned by the
 * Organization module itself — the same precedent as
 * `PersonExistenceRepository`: Organization never imports People (ADR-012
 * §4, enforced by `organization-must-not-import-configuration`'s sibling
 * dependency-direction rule), so this is queried directly against the
 * `employees` table rather than reused from People's own
 * `EmployeeDisplayLookup`. Used only by the Assignment Administration UI to
 * populate person/manager pickers and to identify employees with no current
 * placement — never a dependency of any domain or query-service code.
 */
export interface OrganizationEmployeeDirectoryEntry {
  id: string;
  displayName: string;
}

export interface OrganizationEmployeeDirectory {
  listAll(tenantId: string): Promise<OrganizationEmployeeDirectoryEntry[]>;
}
