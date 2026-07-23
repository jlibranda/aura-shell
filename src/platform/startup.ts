import { ApplicationError } from "@/platform/errors";
import { validateEnvironment, type ValidatedEnvironment } from "@/platform/env";
import { logger } from "@/platform/observability/logger";
import { getPrismaClient } from "@/platform/persistence/prisma-client";

export interface StartupChecks {
  environment: "valid" | "invalid";
  database: "reachable" | "unreachable";
  migrations: "compatible" | "incompatible";
}

export type StartupState =
  | Readonly<{ status: "pending" }>
  | Readonly<{ status: "ready"; startedAt: string; environment: ValidatedEnvironment; checks: StartupChecks }>
  | Readonly<{ status: "failed"; startedAt: string; reason: string; checks: Partial<StartupChecks> }>;

/** runStartup() always completes; it only ever resolves to a settled outcome, never "pending". */
export type ResolvedStartupState = Extract<StartupState, { status: "ready" | "failed" }>;

let state: StartupState = Object.freeze({ status: "pending" });
let startupPromise: Promise<ResolvedStartupState> | undefined;

async function checkDatabaseReachable(): Promise<void> {
  await getPrismaClient().$queryRaw`SELECT 1`;
}

/** A migration row with a null finished_at means Prisma applied it but never marked it complete. */
async function checkMigrationsCompatible(): Promise<void> {
  const rows = await getPrismaClient().$queryRaw<{ count: bigint }[]>`SELECT count(*)::int AS count FROM "_prisma_migrations" WHERE finished_at IS NULL`;
  const pending = Number(rows[0]?.count ?? 0);
  if (pending > 0) throw new ApplicationError("MIGRATIONS_INCOMPLETE", `${pending} migration(s) have not finished applying.`);
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown startup failure";
}

/** Runs every startup check in order, capturing partial results even on failure. Never throws. */
async function runStartup(): Promise<ResolvedStartupState> {
  const startedAt = new Date().toISOString();
  const checks: Partial<StartupChecks> = {};

  let environment: ValidatedEnvironment;
  try {
    environment = validateEnvironment();
    checks.environment = "valid";
  } catch (error) {
    checks.environment = "invalid";
    return fail(startedAt, checks, error);
  }

  try {
    await checkDatabaseReachable();
    checks.database = "reachable";
  } catch (error) {
    checks.database = "unreachable";
    return fail(startedAt, checks, error);
  }

  try {
    await checkMigrationsCompatible();
    checks.migrations = "compatible";
  } catch (error) {
    checks.migrations = "incompatible";
    return fail(startedAt, checks, error);
  }

  const ready: ResolvedStartupState = Object.freeze({ status: "ready", startedAt, environment, checks: checks as StartupChecks });
  state = ready;
  logger.info("startup.completed", { component: "startup", operation: "runStartup", durationMs: Date.now() - Date.parse(startedAt) });
  return ready;
}

function fail(startedAt: string, checks: Partial<StartupChecks>, error: unknown): ResolvedStartupState {
  const failed: ResolvedStartupState = Object.freeze({ status: "failed", startedAt, reason: messageOf(error), checks: Object.freeze({ ...checks }) });
  state = failed;
  logger.error("startup.failed", {
    component: "startup",
    operation: "runStartup",
    errorCode: error instanceof ApplicationError ? error.code : "UNEXPECTED",
    checks,
  });
  return failed;
}

/**
 * Runs startup validation exactly once per process. Concurrent and repeated
 * calls all share the same in-flight/resolved result rather than re-running
 * checks against the database.
 */
export function ensureStartupValidated(): Promise<ResolvedStartupState> {
  startupPromise ??= runStartup();
  return startupPromise;
}

export function getStartupState(): StartupState {
  return state;
}

/** Test-only: clears the memoized state so a test can exercise runStartup more than once. */
export function __resetStartupStateForTests(): void {
  state = Object.freeze({ status: "pending" });
  startupPromise = undefined;
}
