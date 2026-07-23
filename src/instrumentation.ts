/**
 * Next.js calls register() exactly once per server process on boot. It is the
 * canonical hook for "run this before the app accepts traffic."
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const { ensureStartupValidated } = await import("@/platform/startup");
  const { logger } = await import("@/platform/observability/logger");

  const state = await ensureStartupValidated();

  if (state.status === "failed") {
    logger.error("startup.terminate", { component: "startup", operation: "register", reason: state.reason, checks: state.checks });
    // Dev keeps running so iteration isn't blocked by an incomplete local .env;
    // a real deployment must not accept traffic in a failed startup state.
    if (process.env.NODE_ENV === "production") process.exit(1);
    return;
  }

  logger.info("startup.ready", { component: "startup", operation: "register", checks: state.checks });
}
