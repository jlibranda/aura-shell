import { randomUUID } from "node:crypto";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type {
  CreateOrgUnitInput,
  MoveOrgUnitInput,
  OrgUnitReadRepository,
  OrgUnitWriteRepository,
  RenameOrgUnitInput,
} from "@/platform/organization/org-unit-repository";
import type { OrgUnitRecord } from "@/platform/organization/org-unit";

function requireOrganizationView(context: TenantContext): void {
  if (!hasPermission(context, "organization.view")) throw new AuthorizationError();
}

/** Shared in-process store so a test can write via one repository and read via the other. */
export class OrgUnitStore {
  readonly units: OrgUnitRecord[] = [];
}

export class InMemoryOrgUnitWriteRepository implements OrgUnitWriteRepository {
  constructor(private readonly store: OrgUnitStore = new OrgUnitStore()) {}

  async findById(tenantId: string, id: string): Promise<OrgUnitRecord | undefined> {
    return this.store.units.find((u) => u.tenantId === tenantId && u.id === id);
  }

  async findByCode(tenantId: string, code: string): Promise<OrgUnitRecord | undefined> {
    return this.store.units.find((u) => u.tenantId === tenantId && u.code === code);
  }

  async listAll(tenantId: string): Promise<OrgUnitRecord[]> {
    return this.store.units.filter((u) => u.tenantId === tenantId);
  }

  async create(input: CreateOrgUnitInput): Promise<OrgUnitRecord> {
    const now = new Date().toISOString();
    const unit: OrgUnitRecord = Object.freeze({
      id: randomUUID(),
      tenantId: input.tenantId,
      code: input.code,
      name: input.name,
      kind: input.kind,
      ...(input.parentId ? { parentId: input.parentId } : {}),
      status: "ACTIVE" as const,
      createdAt: now,
      createdBy: input.createdBy,
      updatedAt: now,
    });
    this.store.units.push(unit);
    return unit;
  }

  async rename(input: RenameOrgUnitInput): Promise<OrgUnitRecord> {
    return this.replace(input.tenantId, input.id, (u) => ({ ...u, name: input.name }));
  }

  async move(input: MoveOrgUnitInput): Promise<OrgUnitRecord> {
    return this.replace(input.tenantId, input.id, (u) => {
      const next = { ...u };
      if (input.parentId) next.parentId = input.parentId;
      else delete next.parentId;
      return next;
    });
  }

  async archive(tenantId: string, id: string): Promise<OrgUnitRecord> {
    return this.replace(tenantId, id, (u) => ({ ...u, status: "ARCHIVED" as const }));
  }

  private replace(tenantId: string, id: string, mutate: (u: OrgUnitRecord) => OrgUnitRecord): OrgUnitRecord {
    const index = this.store.units.findIndex((u) => u.tenantId === tenantId && u.id === id);
    if (index === -1) throw new Error(`org unit ${id} not found for tenant ${tenantId}`);
    const updated = Object.freeze({ ...mutate(this.store.units[index]), updatedAt: new Date(Date.now() + 1).toISOString() });
    this.store.units[index] = updated;
    return updated;
  }
}

export class InMemoryOrgUnitReadRepository implements OrgUnitReadRepository {
  constructor(private readonly store: OrgUnitStore) {}

  async getById(context: TenantContext, id: string): Promise<OrgUnitRecord | undefined> {
    requireOrganizationView(context);
    return this.store.units.find((u) => u.tenantId === context.tenantId && u.id === id);
  }

  async getByCode(context: TenantContext, code: string): Promise<OrgUnitRecord | undefined> {
    requireOrganizationView(context);
    return this.store.units.find((u) => u.tenantId === context.tenantId && u.code === code);
  }

  async listChildren(context: TenantContext, parentId: string | null): Promise<OrgUnitRecord[]> {
    requireOrganizationView(context);
    return this.store.units
      .filter((u) => u.tenantId === context.tenantId && (parentId === null ? !u.parentId : u.parentId === parentId))
      .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  }

  async listAll(context: TenantContext): Promise<OrgUnitRecord[]> {
    requireOrganizationView(context);
    return this.store.units
      .filter((u) => u.tenantId === context.tenantId)
      .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  }
}
