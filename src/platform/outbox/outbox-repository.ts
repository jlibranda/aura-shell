import type { OutboxMessage } from "@/platform/outbox/outbox-message";

export interface OutboxRepository {
  append(messages: readonly OutboxMessage[]): Promise<void>;
  claimNext(input: Readonly<{ now: string; leaseOwner: string; leaseExpiresAt: string }>): Promise<OutboxMessage | undefined>;
  markProcessed(input: Readonly<{ messageId: string; leaseOwner: string; processedAt: string }>): Promise<boolean>;
  scheduleRetry(input: Readonly<{ messageId: string; leaseOwner: string; availableAt: string; errorCode: string }>): Promise<boolean>;
  deadLetter(input: Readonly<{ messageId: string; leaseOwner: string; occurredAt: string; errorCode: string }>): Promise<boolean>;
  inspect(): Promise<readonly Pick<OutboxMessage, "state" | "attempts" | "availableAt" | "leaseExpiresAt" | "lastErrorCode">[]>;
}
