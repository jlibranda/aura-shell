import type { PrismaClient } from "@prisma/client";
import type { SanitizedSubmissionSuccess, SubmissionClaim, SubmissionIdempotencyRepository } from "@/platform/submissions/submission-idempotency-repository";

type Client = Pick<PrismaClient, "submissionIdempotencyRecord">;
const isUniqueViolation = (error: unknown) => typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === "P2002";

export class PrismaSubmissionIdempotencyRepository implements SubmissionIdempotencyRepository {
  constructor(private readonly prisma: Client) {}

  async claim(input: Readonly<{ tenantId: string; key: string; commandType: string; requestHash: string }>): Promise<SubmissionClaim> {
    try {
      await this.prisma.submissionIdempotencyRecord.create({ data: { tenantId: input.tenantId, idempotencyKey: input.key, commandType: input.commandType, requestHash: input.requestHash, state: "in_progress" } });
      return Object.freeze({ kind: "claimed" });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const existing = await this.prisma.submissionIdempotencyRecord.findUnique({ where: { tenantId_idempotencyKey: { tenantId: input.tenantId, idempotencyKey: input.key } } });
      if (!existing || existing.commandType !== input.commandType || existing.requestHash !== input.requestHash) return Object.freeze({ kind: "key_reused" });
      if (existing.state === "completed" && existing.result) return Object.freeze({ kind: "completed", result: existing.result as SanitizedSubmissionSuccess });
      return Object.freeze({ kind: "in_progress" });
    }
  }

  async complete(input: Readonly<{ tenantId: string; key: string; result: SanitizedSubmissionSuccess }>): Promise<void> {
    const update = await this.prisma.submissionIdempotencyRecord.updateMany({ where: { tenantId: input.tenantId, idempotencyKey: input.key, state: "in_progress" }, data: { state: "completed", result: input.result } });
    if (update.count !== 1) throw new Error("Submission idempotency record could not be completed.");
  }
}
