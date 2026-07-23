import { logger } from "@/platform/observability/logger";
import { getRequestCorrelationId } from "@/platform/observability/request-context";
import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { ensureStartupValidated } from "@/platform/startup";

export const dynamic = "force-dynamic";

async function isDatabaseReachableNow(): Promise<boolean> {
  try {
    await getPrismaClient().$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

/**
 * Readiness reflects current state, not just historical startup success: it
 * re-checks the database on every call so a database outage after a healthy
 * boot correctly flips this to 503.
 */
export async function GET(): Promise<Response> {
  const correlationId = getRequestCorrelationId();
  const startedAt = Date.now();

  const startup = await ensureStartupValidated();
  const databaseReachable = await isDatabaseReachableNow();
  const ready = startup.status === "ready" && databaseReachable;

  logger.info("health.ready", {
    component: "health",
    operation: "ready",
    correlationId,
    durationMs: Date.now() - startedAt,
    outcome: ready ? "ready" : "not_ready",
    startupStatus: startup.status,
    databaseReachable,
  });

  return Response.json(
    {
      status: ready ? "ready" : "not_ready",
      startup: startup.status,
      database: databaseReachable ? "reachable" : "unreachable",
      timestamp: new Date().toISOString(),
    },
    { status: ready ? 200 : 503 },
  );
}
