export interface AuthUserRecord {
  id: string;
  email: string;
  passwordHash: string;
  passwordSalt: string;
  status: string;
}

export interface TenantMembershipRecord {
  tenantId: string;
  roles: string[];
  status: string;
}

export interface CreateUserInput {
  email: string;
  passwordHash: string;
  passwordSalt: string;
}

export interface UpsertMembershipInput {
  userId: string;
  tenantId: string;
  roles: readonly string[];
}

/** Server-only port over the platform login identity. Never imported by client code. */
export interface UserRepository {
  findById(userId: string): Promise<AuthUserRecord | undefined>;
  findByEmail(email: string): Promise<AuthUserRecord | undefined>;
  findActiveMembership(userId: string, tenantId: string): Promise<TenantMembershipRecord | undefined>;
  /** Ordered by tenantId for determinism; login uses the first entry until multi-tenant selection UI exists. */
  findActiveMemberships(userId: string): Promise<TenantMembershipRecord[]>;
  createUser(input: CreateUserInput): Promise<AuthUserRecord>;
  upsertMembership(input: UpsertMembershipInput): Promise<void>;
}
