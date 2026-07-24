export interface StoredSession {
  id: string;
  userId: string;
  tenantId: string;
  expiresAt: Date;
}

export interface CreateSessionInput {
  tokenHash: string;
  userId: string;
  tenantId: string;
  expiresAt: Date;
}

/** Server-only port over durable sessions. Never imported by client code. */
export interface SessionRepository {
  create(input: CreateSessionInput): Promise<StoredSession>;
  findByTokenHash(tokenHash: string): Promise<StoredSession | undefined>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
}
