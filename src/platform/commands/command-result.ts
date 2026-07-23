import type { ValidationIssue } from "@/platform/validation";

export type CommandResult<TValue = never> =
  | Readonly<{ kind: "success"; value: TValue }>
  | Readonly<{ kind: "validation_failure"; issues: readonly ValidationIssue[] }>
  | Readonly<{ kind: "authorization_failure"; message: string }>
  | Readonly<{ kind: "conflict"; message: string }>
  | Readonly<{ kind: "infrastructure_failure"; message: string }>
  | Readonly<{ kind: "unexpected_failure"; message: string }>;

export const commandSuccess = <TValue>(value: TValue): CommandResult<TValue> => Object.freeze({ kind: "success", value });
export const commandValidationFailure = (issues: readonly ValidationIssue[]): CommandResult<never> => Object.freeze({ kind: "validation_failure", issues: Object.freeze([...issues]) });
export const commandAuthorizationFailure = (message: string): CommandResult<never> => Object.freeze({ kind: "authorization_failure", message });
export const commandConflict = (message: string): CommandResult<never> => Object.freeze({ kind: "conflict", message });
export const commandInfrastructureFailure = (message: string): CommandResult<never> => Object.freeze({ kind: "infrastructure_failure", message });
export const commandUnexpectedFailure = (): CommandResult<never> => Object.freeze({ kind: "unexpected_failure", message: "The command could not be prepared." });
