import type { PersonExistenceRepository } from "@/platform/organization/person-existence-repository";

/** In-memory existence check for server-side tests and development only. Seed known employees with `add`. */
export class InMemoryPersonExistenceRepository implements PersonExistenceRepository {
  private readonly known = new Set<string>();

  add(tenantId: string, id: string): void {
    this.known.add(`${tenantId}::${id}`);
  }

  async existsById(tenantId: string, id: string): Promise<boolean> {
    return this.known.has(`${tenantId}::${id}`);
  }
}
