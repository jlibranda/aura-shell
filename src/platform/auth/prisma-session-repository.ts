import type { PrismaClient } from "@prisma/client";
import type { CreateSessionInput, SessionRepository, StoredSession } from "@/platform/auth/session-repository";

type PrismaSessionClient = Pick<PrismaClient, "session">;

function toSession(value: { id: string; userId: string; tenantId: string; expiresAt: Date }): StoredSession {
  return { id: value.id, userId: value.userId, tenantId: value.tenantId, expiresAt: value.expiresAt };
}

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaSessionClient) {}

  async create(input: CreateSessionInput): Promise<StoredSession> {
    const session = await this.prisma.session.create({ data: { tokenHash: input.tokenHash, userId: input.userId, tenantId: input.tenantId, expiresAt: input.expiresAt } });
    return toSession(session);
  }

  async findByTokenHash(tokenHash: string): Promise<StoredSession | undefined> {
    const session = await this.prisma.session.findUnique({ where: { tokenHash } });
    return session ? toSession(session) : undefined;
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash } });
  }
}
