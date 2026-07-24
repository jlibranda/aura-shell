import { validateEnvironment } from "@/platform/env";
import { PrismaSessionRepository } from "@/platform/auth/prisma-session-repository";
import { PrismaUserRepository } from "@/platform/auth/prisma-user-repository";
import { getPrismaClient } from "@/platform/persistence/prisma-client";

/** Request-local composition of the production auth dependencies. */
export function createProductionAuthRuntime() {
  const prisma = getPrismaClient();
  const { nextAuthSecret } = validateEnvironment();
  return {
    users: new PrismaUserRepository(prisma),
    sessions: new PrismaSessionRepository(prisma),
    secret: nextAuthSecret,
  };
}
