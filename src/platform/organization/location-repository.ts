import type { TenantContext } from "@/platform/context";
import type { Address, LocationRecord } from "@/platform/organization/location";

export interface CreateLocationInput {
  tenantId: string;
  code: string;
  name: string;
  address: Address;
  countryCode: string;
  timezone: string;
  createdBy: string;
}

export interface UpdateLocationDetailsInput {
  tenantId: string;
  id: string;
  name: string;
  address: Address;
  countryCode: string;
  timezone: string;
}

/**
 * Server-only write port for locations. Used only inside a tenant-scoped
 * write transaction. `id` and `code` are immutable — there is deliberately no
 * method to change them. There is no delete: a location is archived, never
 * removed, so identifiers are never reused.
 */
export interface LocationWriteRepository {
  findById(tenantId: string, id: string): Promise<LocationRecord | undefined>;
  findByCode(tenantId: string, code: string): Promise<LocationRecord | undefined>;
  create(input: CreateLocationInput): Promise<LocationRecord>;
  updateDetails(input: UpdateLocationDetailsInput): Promise<LocationRecord>;
  archive(tenantId: string, id: string): Promise<LocationRecord>;
}

/** Transaction-scoped repositories exposed to the location write service via UnitOfWork.execute(). */
export type LocationTransactionRepositories = Readonly<{ locations: LocationWriteRepository }>;

/**
 * Server-only read port. Read-only, tenant-scoped, used outside any write
 * transaction. Every method requires organization.view.
 */
export interface LocationReadRepository {
  getById(context: TenantContext, id: string): Promise<LocationRecord | undefined>;
  getByCode(context: TenantContext, code: string): Promise<LocationRecord | undefined>;
  /** Only ACTIVE locations — the default listing for any picker/roster consumer. */
  listActive(context: TenantContext): Promise<LocationRecord[]>;
  /** Every location regardless of status, for history/audit-style views. */
  listAll(context: TenantContext): Promise<LocationRecord[]>;
}
