import { createHash } from "node:crypto";
import { AURA_COMMAND_PERMISSION_REQUIREMENTS, PermissionAuthorizationPolicy } from "@/platform/authorization/authorization-policy";
import type { CommandResult } from "@/platform/commands/command-result";
import { createDurableApplicationRuntime, type DurableApplicationRuntime } from "@/platform/durable-application-runtime";
import { createCreateEmployeeCommand, validateCreateEmployeeCommand, type CreateEmployeeCommand, type CreateEmployeeCommandInput } from "@/platform/people/commands/create-employee-command";
import type { TrustedRequestContext } from "@/platform/runtime-context";
import type { SanitizedSubmissionSuccess, SubmissionIdempotencyRepository } from "@/platform/submissions/submission-idempotency-repository";
import type { DurableEmployeeCreation } from "@/platform/people/commands/create-employee-durable-handler";

export type TrustedCreateEmployeeSubmission = Readonly<{ idempotencyKey: string; command: unknown }>;
export type SubmissionGatewayResult =
  | Readonly<{ kind: "success"; value: SanitizedSubmissionSuccess; replayed: boolean }>
  | Readonly<{ kind: "validation_failure"; issues: readonly { path: readonly string[]; code: string; message: string }[] }>
  | Readonly<{ kind: "authorization_failure"; message: string }>
  | Readonly<{ kind: "conflict"; message: string }>
  | Readonly<{ kind: "infrastructure_failure"; message: string }>
  | Readonly<{ kind: "unexpected_failure"; message: string }>;

export type SubmissionGatewayDependencies = Readonly<{
  authenticate: () => Promise<TrustedRequestContext> | TrustedRequestContext;
  idempotency: SubmissionIdempotencyRepository;
  createRuntime?: (request: TrustedRequestContext) => DurableApplicationRuntime;
  executeAtomically?: (request: TrustedRequestContext, command: CreateEmployeeCommand, complete: (value: DurableEmployeeCreation) => Promise<void>) => Promise<CommandResult<DurableEmployeeCreation>>;
}>;

const value = (record: Record<string, unknown>, key: string, nullable = false): string | null | undefined => {
  const item = record[key];
  if (nullable && item === null) return null;
  return typeof item === "string" ? item : undefined;
};
const object = (input: unknown): Record<string, unknown> | undefined => typeof input === "object" && input !== null && !Array.isArray(input) ? input as Record<string, unknown> : undefined;
const strings = (record: Record<string, unknown> | undefined, fields: readonly string[]): Record<string, string> | undefined => {
  if (!record) return undefined;
  const result: Record<string, string> = {};
  for (const field of fields) { const item = value(record, field); if (typeof item !== "string") return undefined; result[field] = item; }
  return result;
};

function parseCommand(input: unknown): CreateEmployeeCommand | undefined {
  const root = object(input); if (!root) return undefined;
  const personal = strings(object(root.personal), ["firstName", "middleName", "lastName", "preferredName", "gender", "maritalStatus", "nationality"]);
  const contact = strings(object(root.contact), ["personalEmail", "workEmail", "mobileNumber", "homeAddress"]);
  const employment = strings(object(root.employment), ["departmentId", "teamId", "position", "managerId", "employmentType", "workLocation"]);
  const emergencyContact = strings(object(root.emergencyContact), ["name", "relationship", "mobileNumber", "email", "address"]);
  const dateOfBirth = value(object(root.personal) ?? {}, "dateOfBirth", true);
  const hireDate = value(object(root.employment) ?? {}, "hireDate", true);
  if (!personal || !contact || !employment || !emergencyContact || (dateOfBirth !== null && dateOfBirth === undefined) || (hireDate !== null && hireDate === undefined)) return undefined;
  return createCreateEmployeeCommand({ personal: { ...personal, dateOfBirth: dateOfBirth ?? null }, contact, employment: { ...employment, hireDate: hireDate ?? null }, emergencyContact } as CreateEmployeeCommandInput);
}

const invalidEnvelope = (): SubmissionGatewayResult => Object.freeze({ kind: "validation_failure", issues: Object.freeze([{ path: ["request"], code: "invalid_submission", message: "The submission request is invalid." }]) });
const hash = (command: CreateEmployeeCommand) => createHash("sha256").update(JSON.stringify(command)).digest("hex");

/**
 * Internal server gateway only. It accepts no browser identity fields and is
 * intentionally not exported from a route handler, server action, or UI path.
 */
export async function submitCreateEmployee(
  submission: TrustedCreateEmployeeSubmission,
  dependencies: SubmissionGatewayDependencies,
): Promise<SubmissionGatewayResult> {
  const key = submission.idempotencyKey?.trim();
  const command = parseCommand(submission.command);
  if (!key || key.length > 200 || !command) return invalidEnvelope();
  const validation = validateCreateEmployeeCommand(command);
  if (!validation.success) return Object.freeze({ kind: "validation_failure", issues: Object.freeze(validation.issues) });

  let request: TrustedRequestContext;
  try { request = await dependencies.authenticate(); }
  catch { return Object.freeze({ kind: "authorization_failure", message: "A verified authenticated principal is required." }); }
  const decision = new PermissionAuthorizationPolicy(AURA_COMMAND_PERMISSION_REQUIREMENTS).authorize(request, command);
  if (decision.kind === "denied") return Object.freeze({ kind: "authorization_failure", message: decision.message });

  let claim;
  try { claim = await dependencies.idempotency.claim({ tenantId: request.principal.tenantId, key, commandType: command.type, requestHash: hash(command) }); }
  catch { return Object.freeze({ kind: "infrastructure_failure", message: "Submission processing is temporarily unavailable." }); }
  if (claim.kind === "completed") return Object.freeze({ kind: "success", value: claim.result, replayed: true });
  if (claim.kind === "key_reused") return Object.freeze({ kind: "conflict", message: "The idempotency key was already used for a different request." });
  if (claim.kind === "in_progress") return Object.freeze({ kind: "conflict", message: "This submission is already being processed." });

  let output: SanitizedSubmissionSuccess | undefined;
  const complete = async (value: DurableEmployeeCreation) => { output = Object.freeze({ kind: "created", employeeId: value.employee.id, employeeNumber: value.employee.employeeNumber, correlationId: value.correlationId }); await dependencies.idempotency.complete({ tenantId: request.principal.tenantId, key, result: output }); };
  let result: CommandResult<DurableEmployeeCreation>;
  try { result = dependencies.executeAtomically ? await dependencies.executeAtomically(request, command, complete) : await (dependencies.createRuntime ?? createDurableApplicationRuntime)(request).commands.executeDurableCreateEmployee(command); }
  catch { return Object.freeze({ kind: "infrastructure_failure", message: "Employee creation could not be completed." }); }
  if (result.kind !== "success") return result;
  if (!output) {
    try { await complete(result.value); }
    catch { return Object.freeze({ kind: "infrastructure_failure", message: "Employee creation completed but the submission result could not be recorded." }); }
  }
  return Object.freeze({ kind: "success", value: output!, replayed: false });
}
