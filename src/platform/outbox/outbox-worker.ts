import { randomUUID } from "node:crypto";
import type { OutboxDispatcher } from "@/platform/outbox/outbox-dispatcher";
import type { OutboxRepository } from "@/platform/outbox/outbox-repository";

export interface OutboxClock { now(): string; }
export interface OutboxWorkerOptions { workerId?: string; leaseDurationMs?: number; maxAttempts?: number; retryDelayMs?: (attempt: number) => number; }
export class PermanentOutboxDispatchError extends Error { readonly code = "permanent_invalid"; }
const defaultClock: OutboxClock = { now: () => new Date().toISOString() };
const retryDelay = (attempt: number) => Math.min(60_000, 1_000 * 2 ** Math.max(0, attempt - 1));

/** Explicit one-message worker; no scheduler or external dispatcher is registered. */
export class OutboxWorker {
  private readonly workerId: string; private readonly leaseDurationMs: number; private readonly maxAttempts: number; private readonly delay: (attempt: number) => number;
  constructor(private readonly repository: OutboxRepository, private readonly dispatcher: OutboxDispatcher, private readonly clock: OutboxClock = defaultClock, options: OutboxWorkerOptions = {}) { this.workerId = options.workerId ?? `outbox-${randomUUID()}`; this.leaseDurationMs = options.leaseDurationMs ?? 300_000; this.maxAttempts = options.maxAttempts ?? 5; this.delay = options.retryDelayMs ?? retryDelay; }
  async processOne(): Promise<"idle" | "processed" | "retry_scheduled" | "dead_lettered"> {
    const now = this.clock.now(); const message = await this.repository.claimNext({ now, leaseOwner: this.workerId, leaseExpiresAt: new Date(Date.parse(now) + this.leaseDurationMs).toISOString() });
    if (!message) return "idle";
    try {
      await this.dispatcher.dispatch(message);
      return await this.repository.markProcessed({ messageId: message.messageId, leaseOwner: this.workerId, processedAt: this.clock.now() }) ? "processed" : "idle";
    } catch (error) {
      const permanent = error instanceof PermanentOutboxDispatchError;
      if (permanent || message.attempts >= this.maxAttempts) return await this.repository.deadLetter({ messageId: message.messageId, leaseOwner: this.workerId, occurredAt: this.clock.now(), errorCode: permanent ? "permanent_invalid" : "retry_exhausted" }) ? "dead_lettered" : "idle";
      const availableAt = new Date(Date.parse(this.clock.now()) + this.delay(message.attempts)).toISOString();
      return await this.repository.scheduleRetry({ messageId: message.messageId, leaseOwner: this.workerId, availableAt, errorCode: "retryable_dispatch_failure" }) ? "retry_scheduled" : "idle";
    }
  }
}
