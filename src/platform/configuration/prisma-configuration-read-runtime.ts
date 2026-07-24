import type { TenantContext } from "@/platform/context";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { PrismaConfigurationReadRepository } from "@/platform/configuration/prisma-configuration-read-repository";
import type { ConfigurationReadRepository } from "@/platform/configuration/configuration-repository";
import { createConfigurationResolvers, type ConfigurationResolvers } from "@/platform/configuration/configuration-resolvers";
import { PrismaConfigurationAuditReadRepository } from "@/platform/configuration/prisma-configuration-audit-read-repository";
import type { ConfigurationAuditReadRepository } from "@/platform/configuration/configuration-audit-read-repository";
import type { TrustedRequestContext } from "@/platform/runtime-context";
import { createTenantContext } from "@/platform/runtime-context";

export interface PrismaConfigurationReadRuntime {
  readonly context: TenantContext;
  readonly reader: ConfigurationReadRepository;
  readonly resolvers: ConfigurationResolvers;
  readonly auditReader: ConfigurationAuditReadRepository;
}

/**
 * Request-local durable read composition. It deliberately exposes no
 * write/publish capability — those only exist behind the durable command
 * pipeline (see prisma-configuration-unit-of-work.ts and the *DurableHandler
 * classes in commands/).
 */
export function createPrismaConfigurationReadRuntime(request: TrustedRequestContext): PrismaConfigurationReadRuntime {
  const prisma = getPrismaClient();
  const reader = new PrismaConfigurationReadRepository(prisma);
  return Object.freeze({
    context: createTenantContext(request),
    reader,
    resolvers: createConfigurationResolvers(reader),
    auditReader: new PrismaConfigurationAuditReadRepository(prisma),
  });
}
