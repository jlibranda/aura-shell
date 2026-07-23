import type { OutboxMessage } from "@/platform/outbox/outbox-message";

/** Future delivery adapters implement this; none are registered in Slice 6L. */
export interface OutboxDispatcher { dispatch(message: OutboxMessage): Promise<void>; }
