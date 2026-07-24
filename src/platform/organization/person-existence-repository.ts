/**
 * A minimal, read-only existence check the organization domain needs to
 * validate that an Assignment's person/manager refers to a real Employee in
 * the same tenant (ADR-012 §7). This is deliberately not a dependency on the
 * People domain's write machinery — just enough to turn a missing employee
 * into a clean validation error instead of a raw foreign-key violation. The
 * database-level composite foreign key (tenant_id, person_id) -> employees is
 * the actual guarantee; this is only the pre-check for a good error message.
 */
export interface PersonExistenceRepository {
  existsById(tenantId: string, id: string): Promise<boolean>;
}
