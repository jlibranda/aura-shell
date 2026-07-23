import { classifyError } from "@/platform/observability/error-classification";
import { logger } from "@/platform/observability/logger";

/**
 * Measures an async operation and logs its outcome with duration. Rethrows on
 * failure so callers keep their existing error handling; this only observes.
 */
export async function withTiming<T>(
  component: string,
  operation: string,
  fn: () => Promise<T>,
  fields: Record<string, unknown> = {},
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await fn();
    logger.info(`${component}.${operation}`, { component, operation, durationMs: Date.now() - startedAt, outcome: "success", ...fields });
    return result;
  } catch (error) {
    const classified = classifyError(error);
    logger.error(`${component}.${operation}`, { component, operation, durationMs: Date.now() - startedAt, outcome: "failure", errorCode: classified.code, ...fields });
    throw error;
  }
}
