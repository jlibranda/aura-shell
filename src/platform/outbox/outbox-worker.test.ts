import { describe, expect, it, vi } from "vitest";
import { OutboxWorker, PermanentOutboxDispatchError } from "@/platform/outbox/outbox-worker";
import type { OutboxMessage } from "@/platform/outbox/outbox-message";
import type { OutboxRepository } from "@/platform/outbox/outbox-repository";

const message: OutboxMessage = { messageId: "event-1", eventId: "event-1", tenantId: "nw-ph", eventName: "employee.created", aggregateType: "employee", aggregateId: "employee-1", correlationId: "correlation", occurredAt: "2026-07-23T00:00:00.000Z", payload: { employeeId: "employee-1" }, state: "processing", attempts: 1, availableAt: "2026-07-23T00:00:00.000Z", leaseOwner: "worker-a" };
const clock = { now: () => "2026-07-23T00:00:00.000Z" };
function repository(claim: OutboxMessage | null = message): OutboxRepository { return { append: vi.fn(), claimNext: vi.fn().mockResolvedValue(claim), markProcessed: vi.fn().mockResolvedValue(true), scheduleRetry: vi.fn().mockResolvedValue(true), deadLetter: vi.fn().mockResolvedValue(true), inspect: vi.fn().mockResolvedValue([]) }; }

describe("OutboxWorker", () => {
  const options = { workerId: "worker-a", retryDelayMs: (attempt: number) => attempt * 1_000 };
  it("marks a successfully dispatched message only with the current lease owner", async () => {
    const store = repository(); const dispatcher = { dispatch: vi.fn().mockResolvedValue(undefined) };
    await expect(new OutboxWorker(store, dispatcher, clock, options).processOne()).resolves.toBe("processed");
    expect(store.claimNext).toHaveBeenCalledWith({ now: clock.now(), leaseOwner: "worker-a", leaseExpiresAt: "2026-07-23T00:05:00.000Z" });
    expect(store.markProcessed).toHaveBeenCalledWith({ messageId: "event-1", leaseOwner: "worker-a", processedAt: clock.now() });
  });
  it("schedules a deterministic bounded retry without retaining the raw dispatch error", async () => {
    const store = repository(); const dispatcher = { dispatch: vi.fn().mockRejectedValue(new Error("database password: secret")) };
    await expect(new OutboxWorker(store, dispatcher, clock, options).processOne()).resolves.toBe("retry_scheduled");
    expect(store.scheduleRetry).toHaveBeenCalledWith({ messageId: "event-1", leaseOwner: "worker-a", availableAt: "2026-07-23T00:00:01.000Z", errorCode: "retryable_dispatch_failure" });
  });
  it("dead-letters permanent failures", async () => {
    const store = repository(); const dispatcher = { dispatch: vi.fn().mockRejectedValue(new PermanentOutboxDispatchError()) };
    await expect(new OutboxWorker(store, dispatcher, clock, options).processOne()).resolves.toBe("dead_lettered");
    expect(store.deadLetter).toHaveBeenCalledWith({ messageId: "event-1", leaseOwner: "worker-a", occurredAt: clock.now(), errorCode: "permanent_invalid" });
  });
  it("dead-letters exhausted retry attempts", async () => {
    const store = repository({ ...message, attempts: 5 }); const dispatcher = { dispatch: vi.fn().mockRejectedValue(new Error("offline")) };
    await expect(new OutboxWorker(store, dispatcher, clock, options).processOne()).resolves.toBe("dead_lettered");
    expect(store.deadLetter).toHaveBeenCalledWith(expect.objectContaining({ errorCode: "retry_exhausted" }));
  });
  it("does not report a stale owner transition as success", async () => { const store = repository(); vi.mocked(store.markProcessed).mockResolvedValue(false); await expect(new OutboxWorker(store, { dispatch: vi.fn().mockResolvedValue(undefined) }, clock, options).processOne()).resolves.toBe("idle"); });
  it("does nothing when no message is eligible", async () => { const store = repository(null); const dispatcher = { dispatch: vi.fn() }; await expect(new OutboxWorker(store, dispatcher, clock, options).processOne()).resolves.toBe("idle"); expect(dispatcher.dispatch).not.toHaveBeenCalled(); });
});
