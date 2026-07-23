import { getPrismaClient } from "@/platform/persistence/prisma-client";
import { createDurableApplicationRuntime } from "@/platform/durable-application-runtime";
import { PrismaSubmissionIdempotencyRepository } from "@/platform/submissions/prisma-submission-idempotency-repository";
import { submitCreateEmployee, type SubmissionGatewayResult, type TrustedCreateEmployeeSubmission } from "@/platform/submissions/create-employee-submission-gateway";
import type { TrustedRequestContext } from "@/platform/runtime-context";
import type { Prisma } from "@prisma/client";

/**
 * Explicit internal server composition. An approved authentication adapter is
 * mandatory; this factory deliberately has no route, action, or development
 * session default.
 */
export function createTrustedCreateEmployeeSubmissionRuntime(
  authenticate: () => Promise<TrustedRequestContext> | TrustedRequestContext,
): Readonly<{ submit(submission: TrustedCreateEmployeeSubmission): Promise<SubmissionGatewayResult> }> {
  const prisma = getPrismaClient();
  const idempotency = new PrismaSubmissionIdempotencyRepository(prisma);
  let transactionIdempotency: PrismaSubmissionIdempotencyRepository | undefined;
  const transactionalIdempotency = {
    claim: idempotency.claim.bind(idempotency),
    complete: (input: Parameters<PrismaSubmissionIdempotencyRepository["complete"]>[0]) => (transactionIdempotency ?? idempotency).complete(input),
  };
  return Object.freeze({
    submit: (submission) => submitCreateEmployee(submission, {
      authenticate,
      idempotency: transactionalIdempotency,
      executeAtomically: (request, command, complete) => prisma.$transaction(async (transaction: Prisma.TransactionClient) => {
        transactionIdempotency = new PrismaSubmissionIdempotencyRepository(transaction);
        try {
          const transactionRunner = { $transaction: async <T>(operation: (client: Prisma.TransactionClient) => Promise<T>) => operation(transaction) };
          const result = await createDurableApplicationRuntime(request, { prisma: transactionRunner }).commands.executeDurableCreateEmployee(command);
          if (result.kind === "success") await complete(result.value);
          return result;
        } finally { transactionIdempotency = undefined; }
      }),
    }),
  });
}
