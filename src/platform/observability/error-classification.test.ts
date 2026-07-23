import { describe, expect, it } from "vitest";
import { ApplicationError, AuthenticationError, AuthorizationError, ConflictError, NotFoundError, ValidationError } from "@/platform/errors";
import { classifyError } from "@/platform/observability/error-classification";

describe("classifyError", () => {
  it("maps ValidationError to Validation with its own message", () => {
    expect(classifyError(new ValidationError("workEmail is required"))).toEqual({ category: "Validation", code: "VALIDATION", safeMessage: "workEmail is required" });
  });

  it("maps AuthenticationError to Authentication with a generic message", () => {
    expect(classifyError(new AuthenticationError())).toEqual({ category: "Authentication", code: "UNAUTHENTICATED", safeMessage: "Authentication is required." });
  });

  it("maps AuthorizationError to Authorization with a generic message", () => {
    expect(classifyError(new AuthorizationError("internal detail that should not leak"))).toEqual({ category: "Authorization", code: "FORBIDDEN", safeMessage: "You are not authorized to perform this action." });
  });

  it("maps ConflictError to Conflict with its own message", () => {
    expect(classifyError(new ConflictError("duplicate work email"))).toEqual({ category: "Conflict", code: "CONFLICT", safeMessage: "duplicate work email" });
  });

  it("maps NotFoundError to NotFound with its own message", () => {
    expect(classifyError(new NotFoundError("Employee"))).toEqual({ category: "NotFound", code: "NOT_FOUND", safeMessage: "Employee was not found." });
  });

  it("maps a generic ApplicationError to Infrastructure with a generic message, not the raw detail", () => {
    const error = new ApplicationError("DB_TIMEOUT", "connection to 10.0.4.2:5432 timed out after 5s");
    expect(classifyError(error)).toEqual({ category: "Infrastructure", code: "DB_TIMEOUT", safeMessage: "A system error occurred. Please try again." });
  });

  it("maps an unrecognized thrown value to Unexpected without leaking its message", () => {
    expect(classifyError(new TypeError("Cannot read properties of undefined"))).toEqual({ category: "Unexpected", code: "UNEXPECTED", safeMessage: "An unexpected error occurred." });
  });

  it("handles non-Error thrown values safely", () => {
    expect(classifyError("a plain string throw")).toEqual({ category: "Unexpected", code: "UNEXPECTED", safeMessage: "An unexpected error occurred." });
  });
});
