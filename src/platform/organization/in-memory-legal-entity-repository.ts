import { randomUUID } from "node:crypto";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type {
  CreateLegalEntityInput,
  LegalEntityReadRepository,
  LegalEntityWriteRepository,
  UpdateLegalEntityDetailsInput,
} from "@/platform/organization/legal-entity-repository";
import type { LegalEntityRecord } from "@/platform/organization/legal-entity";

function requireOrganizationView(context: TenantContext): void {
  if (!hasPermission(context, "organization.view")) throw new AuthorizationError();
}

/** Shared in-process store so a test can write via one repository and read via the other. */
export class LegalEntityStore {
  readonly legalEntities: LegalEntityRecord[] = [];
}

export class InMemoryLegalEntityWriteRepository implements LegalEntityWriteRepository {
  constructor(private readonly store: LegalEntityStore = new LegalEntityStore()) {}

  async findById(tenantId: string, id: string): Promise<LegalEntityRecord | undefined> {
    return this.store.legalEntities.find((e) => e.tenantId === tenantId && e.id === id);
  }

  async findByCode(tenantId: string, code: string): Promise<LegalEntityRecord | undefined> {
    return this.store.legalEntities.find((e) => e.tenantId === tenantId && e.code === code);
  }

  async create(input: CreateLegalEntityInput): Promise<LegalEntityRecord> {
    const now = new Date().toISOString();
    const entity: LegalEntityRecord = Object.freeze({
      id: randomUUID(),
      tenantId: input.tenantId,
      code: input.code,
      legalName: input.legalName,
      countryCode: input.countryCode,
      status: "ACTIVE" as const,
      createdAt: now,
      createdBy: input.createdBy,
      updatedAt: now,
    });
    this.store.legalEntities.push(entity);
    return entity;
  }

  async updateDetails(input: UpdateLegalEntityDetailsInput): Promise<LegalEntityRecord> {
    return this.replace(input.tenantId, input.id, (e) => ({ ...e, legalName: input.legalName, countryCode: input.countryCode }));
  }

  async archive(tenantId: string, id: string): Promise<LegalEntityRecord> {
    return this.replace(tenantId, id, (e) => ({ ...e, status: "ARCHIVED" as const, archivedAt: new Date().toISOString() }));
  }

  private replace(tenantId: string, id: string, mutate: (e: LegalEntityRecord) => LegalEntityRecord): LegalEntityRecord {
    const index = this.store.legalEntities.findIndex((e) => e.tenantId === tenantId && e.id === id);
    if (index === -1) throw new Error(`legal entity ${id} not found for tenant ${tenantId}`);
    const updated = Object.freeze({ ...mutate(this.store.legalEntities[index]), updatedAt: new Date(Date.now() + 1).toISOString() });
    this.store.legalEntities[index] = updated;
    return updated;
  }
}

export class InMemoryLegalEntityReadRepository implements LegalEntityReadRepository {
  constructor(private readonly store: LegalEntityStore) {}

  async getById(context: TenantContext, id: string): Promise<LegalEntityRecord | undefined> {
    requireOrganizationView(context);
    return this.store.legalEntities.find((e) => e.tenantId === context.tenantId && e.id === id);
  }

  async getByCode(context: TenantContext, code: string): Promise<LegalEntityRecord | undefined> {
    requireOrganizationView(context);
    return this.store.legalEntities.find((e) => e.tenantId === context.tenantId && e.code === code);
  }

  async listActive(context: TenantContext): Promise<LegalEntityRecord[]> {
    requireOrganizationView(context);
    return this.store.legalEntities
      .filter((e) => e.tenantId === context.tenantId && e.status === "ACTIVE")
      .sort((a, b) => a.legalName.localeCompare(b.legalName) || a.code.localeCompare(b.code));
  }

  async listAll(context: TenantContext): Promise<LegalEntityRecord[]> {
    requireOrganizationView(context);
    return this.store.legalEntities
      .filter((e) => e.tenantId === context.tenantId)
      .sort((a, b) => a.legalName.localeCompare(b.legalName) || a.code.localeCompare(b.code));
  }
}
