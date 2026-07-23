ALTER TABLE "outbox_messages"
  ADD COLUMN "lease_owner" TEXT,
  ADD COLUMN "processing_started_at" TIMESTAMPTZ(6),
  ADD COLUMN "lease_expires_at" TIMESTAMPTZ(6),
  ADD COLUMN "last_error_code" TEXT;

CREATE INDEX "outbox_messages_state_lease_expires_at_idx"
  ON "outbox_messages"("state", "lease_expires_at");
