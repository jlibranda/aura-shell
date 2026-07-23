/**
 * Zero-dependency: safe to import from Edge middleware as well as Node route
 * handlers/Server Actions. Keep this file free of next/headers and node:*
 * imports (see src/platform/observability/correlation-header.ts for why).
 */
export const SESSION_COOKIE_NAME = "aura_session";
export const SESSION_DURATION_MS = 12 * 60 * 60 * 1000; // 12 hours
