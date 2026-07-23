import { PrismaClient } from "@prisma/client";

type PrismaGlobal = typeof globalThis & { __auraPrismaClient?: PrismaClient };

/**
 * Process-local Prisma client for trusted server composition only. It is never
 * imported by application routes, browser actions, or client components.
 */
export function getPrismaClient(): PrismaClient {
  const global = globalThis as PrismaGlobal;
  global.__auraPrismaClient ??= new PrismaClient();
  return global.__auraPrismaClient;
}
