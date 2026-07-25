import { randomUUID } from "node:crypto";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type {
  CreateLocationInput,
  LocationReadRepository,
  LocationWriteRepository,
  UpdateLocationDetailsInput,
} from "@/platform/organization/location-repository";
import type { LocationRecord } from "@/platform/organization/location";

function requireOrganizationView(context: TenantContext): void {
  if (!hasPermission(context, "organization.view")) throw new AuthorizationError();
}

/** Shared in-process store so a test can write via one repository and read via the other. */
export class LocationStore {
  readonly locations: LocationRecord[] = [];
}

export class InMemoryLocationWriteRepository implements LocationWriteRepository {
  constructor(private readonly store: LocationStore = new LocationStore()) {}

  async findById(tenantId: string, id: string): Promise<LocationRecord | undefined> {
    return this.store.locations.find((l) => l.tenantId === tenantId && l.id === id);
  }

  async findByCode(tenantId: string, code: string): Promise<LocationRecord | undefined> {
    return this.store.locations.find((l) => l.tenantId === tenantId && l.code === code);
  }

  async create(input: CreateLocationInput): Promise<LocationRecord> {
    const now = new Date().toISOString();
    const location: LocationRecord = Object.freeze({
      id: randomUUID(),
      tenantId: input.tenantId,
      code: input.code,
      name: input.name,
      address: input.address,
      countryCode: input.countryCode,
      timezone: input.timezone,
      status: "ACTIVE" as const,
      createdAt: now,
      createdBy: input.createdBy,
      updatedAt: now,
    });
    this.store.locations.push(location);
    return location;
  }

  async updateDetails(input: UpdateLocationDetailsInput): Promise<LocationRecord> {
    return this.replace(input.tenantId, input.id, (l) => ({
      ...l,
      name: input.name,
      address: input.address,
      countryCode: input.countryCode,
      timezone: input.timezone,
    }));
  }

  async archive(tenantId: string, id: string): Promise<LocationRecord> {
    return this.replace(tenantId, id, (l) => ({ ...l, status: "ARCHIVED" as const, archivedAt: new Date().toISOString() }));
  }

  private replace(tenantId: string, id: string, mutate: (l: LocationRecord) => LocationRecord): LocationRecord {
    const index = this.store.locations.findIndex((l) => l.tenantId === tenantId && l.id === id);
    if (index === -1) throw new Error(`location ${id} not found for tenant ${tenantId}`);
    const updated = Object.freeze({ ...mutate(this.store.locations[index]), updatedAt: new Date(Date.now() + 1).toISOString() });
    this.store.locations[index] = updated;
    return updated;
  }
}

export class InMemoryLocationReadRepository implements LocationReadRepository {
  constructor(private readonly store: LocationStore) {}

  async getById(context: TenantContext, id: string): Promise<LocationRecord | undefined> {
    requireOrganizationView(context);
    return this.store.locations.find((l) => l.tenantId === context.tenantId && l.id === id);
  }

  async getByCode(context: TenantContext, code: string): Promise<LocationRecord | undefined> {
    requireOrganizationView(context);
    return this.store.locations.find((l) => l.tenantId === context.tenantId && l.code === code);
  }

  async listActive(context: TenantContext): Promise<LocationRecord[]> {
    requireOrganizationView(context);
    return this.store.locations
      .filter((l) => l.tenantId === context.tenantId && l.status === "ACTIVE")
      .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  }

  async listAll(context: TenantContext): Promise<LocationRecord[]> {
    requireOrganizationView(context);
    return this.store.locations
      .filter((l) => l.tenantId === context.tenantId)
      .sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
  }
}
