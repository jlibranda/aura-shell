CREATE TABLE "outbox_messages" (
    "message_id" TEXT NOT NULL,
    "event_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "payload" JSONB NOT NULL,
    "state" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "available_at" TIMESTAMPTZ(6) NOT NULL,
    "processed_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "outbox_messages_pkey" PRIMARY KEY ("message_id")
);

CREATE UNIQUE INDEX "outbox_messages_event_id_key" ON "outbox_messages"("event_id");
CREATE INDEX "outbox_messages_state_available_at_idx" ON "outbox_messages"("state", "available_at");
CREATE INDEX "outbox_messages_tenant_id_occurred_at_idx" ON "outbox_messages"("tenant_id", "occurred_at");

ALTER TABLE "outbox_messages" ADD CONSTRAINT "outbox_messages_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
