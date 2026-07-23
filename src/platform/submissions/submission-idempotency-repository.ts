export type SanitizedSubmissionSuccess = Readonly<{
  kind: "created";
  employeeId: string;
  employeeNumber: string;
  correlationId: string;
}>;

export type SubmissionClaim =
  | Readonly<{ kind: "claimed" }>
  | Readonly<{ kind: "completed"; result: SanitizedSubmissionSuccess }>
  | Readonly<{ kind: "in_progress" }>
  | Readonly<{ kind: "key_reused" }>;

/** Server-only, tenant-scoped durable idempotency port. */
export interface SubmissionIdempotencyRepository {
  claim(input: Readonly<{ tenantId: string; key: string; commandType: string; requestHash: string }>): Promise<SubmissionClaim>;
  complete(input: Readonly<{ tenantId: string; key: string; result: SanitizedSubmissionSuccess }>): Promise<void>;
}
