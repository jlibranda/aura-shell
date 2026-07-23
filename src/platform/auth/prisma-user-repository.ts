import type { PrismaClient } from "@prisma/client";
import type { AuthUserRecord, CreateUserInput, TenantMembershipRecord, UpsertMembershipInput, UserRepository } from "@/platform/auth/user-repository";

type PrismaAuthClient = Pick<PrismaClient, "user" | "tenantMembership">;

function toUser(value: { id: string; email: string; passwordHash: string; passwordSalt: string; status: string }): AuthUserRecord {
  return { id: value.id, email: value.email, passwordHash: value.passwordHash, passwordSalt: value.passwordSalt, status: value.status };
}

function toMembership(value: { tenantId: string; roles: string[]; status: string }): TenantMembershipRecord {
  return { tenantId: value.tenantId, roles: value.roles, status: value.status };
}

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaAuthClient) {}

  async findById(userId: string): Promise<AuthUserRecord | undefined> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    return user ? toUser(user) : undefined;
  }

  async findByEmail(email: string): Promise<AuthUserRecord | undefined> {
    const user = await this.prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
    return user ? toUser(user) : undefined;
  }

  async findActiveMembership(userId: string, tenantId: string): Promise<TenantMembershipRecord | undefined> {
    const membership = await this.prisma.tenantMembership.findUnique({ where: { userId_tenantId: { userId, tenantId } } });
    return membership && membership.status === "active" ? toMembership(membership) : undefined;
  }

  async findActiveMemberships(userId: string): Promise<TenantMembershipRecord[]> {
    const memberships = await this.prisma.tenantMembership.findMany({ where: { userId, status: "active" }, orderBy: { tenantId: "asc" } });
    return memberships.map(toMembership);
  }

  async createUser(input: CreateUserInput): Promise<AuthUserRecord> {
    const user = await this.prisma.user.create({ data: { email: input.email.trim().toLowerCase(), passwordHash: input.passwordHash, passwordSalt: input.passwordSalt } });
    return toUser(user);
  }

  async upsertMembership(input: UpsertMembershipInput): Promise<void> {
    await this.prisma.tenantMembership.upsert({
      where: { userId_tenantId: { userId: input.userId, tenantId: input.tenantId } },
      create: { userId: input.userId, tenantId: input.tenantId, roles: [...input.roles] },
      update: { roles: [...input.roles], status: "active" },
    });
  }
}
