import { headers } from "next/headers";
import { CORRELATION_ID_HEADER } from "@/platform/observability/correlation-header";

export { CORRELATION_ID_HEADER };

/**
 * Reads the correlation ID middleware generated for this request. A browser
 * can never influence this value: middleware always overwrites any inbound
 * copy of this header before it reaches application code. Outside a Next.js
 * request scope (unit tests, scripts) there is no header store to read, so a
 * fresh ID is generated instead of throwing.
 */
export function getRequestCorrelationId(): string {
  try {
    const value = headers().get(CORRELATION_ID_HEADER);
    return value?.trim() || crypto.randomUUID();
  } catch {
    return crypto.randomUUID();
  }
}
