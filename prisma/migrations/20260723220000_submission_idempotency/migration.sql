-- Durable replay protection for internal trusted submissions only.
CREATE TABLE "submission_idempotency_records" (
    "tenant_id" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "command_type" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "result_json" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "submission_idempotency_records_pkey" PRIMARY KEY ("tenant_id", "idempotency_key")
);

ALTER TABLE "submission_idempotency_records"
  ADD CONSTRAINT "submission_idempotency_records_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
