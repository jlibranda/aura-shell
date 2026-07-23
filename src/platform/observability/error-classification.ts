import { ApplicationError, AuthenticationError, AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@/platform/errors";

export type ErrorCategory = "Validation" | "Authentication" | "Authorization" | "Conflict" | "NotFound" | "Infrastructure" | "Unexpected";

export interface ClassifiedError {
  category: ErrorCategory;
  code: string;
  /** Safe for a browser response; never includes stack traces, raw driver errors, or internal detail. */
  safeMessage: string;
}

const GENERIC_SAFE_MESSAGE: Record<Extract<ErrorCategory, "Authentication" | "Authorization" | "Infrastructure" | "Unexpected">, string> = {
  Authentication: "Authentication is required.",
  Authorization: "You are not authorized to perform this action.",
  Infrastructure: "A system error occurred. Please try again.",
  Unexpected: "An unexpected error occurred.",
};

/**
 * Maps an unknown thrown value to a stable category and a browser-safe message.
 * Validation/Conflict/NotFound already carry user-facing messages by construction;
 * every other category returns a generic message so internals never leak.
 */
export function classifyError(error: unknown): ClassifiedError {
  if (error instanceof ValidationError) return { category: "Validation", code: error.code, safeMessage: error.message };
  if (error instanceof AuthenticationError) return { category: "Authentication", code: error.code, safeMessage: GENERIC_SAFE_MESSAGE.Authentication };
  if (error instanceof AuthorizationError) return { category: "Authorization", code: error.code, safeMessage: GENERIC_SAFE_MESSAGE.Authorization };
  if (error instanceof ConflictError) return { category: "Conflict", code: error.code, safeMessage: error.message };
  if (error instanceof NotFoundError) return { category: "NotFound", code: error.code, safeMessage: error.message };
  if (error instanceof ApplicationError) return { category: "Infrastructure", code: error.code, safeMessage: GENERIC_SAFE_MESSAGE.Infrastructure };
  return { category: "Unexpected", code: "UNEXPECTED", safeMessage: GENERIC_SAFE_MESSAGE.Unexpected };
}
