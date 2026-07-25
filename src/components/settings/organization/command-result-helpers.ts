import type { CommandResult } from "@/platform/commands/command-result";

/**
 * A single, generic translation of any non-success CommandResult into a
 * user-safe message — used by every Organization admin drawer/dialog so a
 * validation issue, conflict, permission denial, or infrastructure failure
 * never surfaces a raw Prisma/SQL error, stack trace, or internal name.
 */
export function commandErrorMessage(result: CommandResult<unknown>): string {
  if (result.kind === "validation_failure") return result.issues[0]?.message ?? "Please check the highlighted fields.";
  if (result.kind === "conflict") return result.message;
  if (result.kind === "authorization_failure") return result.message;
  return "The request could not be completed. Please try again.";
}

/** Field-path -> message map for inline form errors, from a validation_failure result. */
export function fieldErrorsFrom(result: CommandResult<unknown>): Record<string, string> {
  if (result.kind === "validation_failure") {
    const next: Record<string, string> = {};
    for (const issue of result.issues) next[issue.path.join(".")] = issue.message;
    return next;
  }
  if (result.kind === "conflict" || result.kind === "authorization_failure") return { _form: result.message };
  return { _form: commandErrorMessage(result) };
}
