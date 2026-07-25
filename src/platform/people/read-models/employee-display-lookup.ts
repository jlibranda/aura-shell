/**
 * A minimal, read-only Employee display-name lookup — just enough for the
 * Organization placement service to turn a manager's person id into a name,
 * or list employees as manager-picker candidates. Deliberately not a
 * dependency on People's full profile/directory read models; this is the
 * People-domain mirror of Organization's own `PersonExistenceRepository`
 * precedent: a narrow, direct read rather than a heavier cross-cutting one.
 */
export interface EmployeeDisplayLookup {
  findDisplayName(tenantId: string, employeeId: string): Promise<string | undefined>;
  listDisplays(tenantId: string): Promise<{ id: string; displayName: string }[]>;
}
