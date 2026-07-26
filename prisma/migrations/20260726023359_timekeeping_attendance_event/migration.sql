-- Timekeeping Slice 1 (ADR-014 §4.3): AttendanceEvent — the immutable,
-- append-only fact that a person's clock-in/out channel registered a punch
-- at a specific instant. No ingestion channel, WorkSchedule, AttendanceDay,
-- policy, approval, adjustment, or Payroll integration is part of this
-- migration — see docs/roadmap/timekeeping-implementation-plan.md.

CREATE TABLE "attendance_events" (
    "attendance_event_id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "occurred_at_utc" TIMESTAMPTZ(6) NOT NULL,
    "received_at_utc" TIMESTAMPTZ(6) NOT NULL,
    "source" TEXT NOT NULL,
    "source_ref" TEXT,
    "event_type" TEXT,
    "idempotency_key" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attendance_events_pkey" PRIMARY KEY ("attendance_event_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "attendance_events_tenant_id_attendance_event_id_key" ON "attendance_events"("tenant_id", "attendance_event_id");

-- CreateIndex: the idempotency boundary (ADR-014 §4.3) — enforced at the
-- database, not application logic alone.
CREATE UNIQUE INDEX "attendance_events_tenant_id_idempotency_key_key" ON "attendance_events"("tenant_id", "idempotency_key");

-- CreateIndex: the range query AttendanceDay calculation (a later slice)
-- will use to read one person's events for one date, ordered by
-- occurred_at_utc rather than insertion order.
CREATE INDEX "attendance_events_tenant_id_person_id_occurred_at_utc_idx" ON "attendance_events"("tenant_id", "person_id", "occurred_at_utc");

-- AddForeignKey
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: same cross-domain composite-key pattern already used by
-- assignments_tenant_id_person_id_fkey.
ALTER TABLE "attendance_events" ADD CONSTRAINT "attendance_events_tenant_id_person_id_fkey" FOREIGN KEY ("tenant_id", "person_id") REFERENCES "employees"("tenant_id", "employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Immutability: AttendanceEvent is create-only (ADR-014 §4.3, §14; Slice 1
-- Core Invariant #1). Repository adapters must use INSERT only; this
-- trigger additionally prevents accidental SQL mutation — the same pattern
-- already used for audit_records and configuration_versions.
CREATE FUNCTION prevent_attendance_event_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'attendance_events are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER attendance_events_prevent_mutation
BEFORE UPDATE OR DELETE ON "attendance_events"
FOR EACH ROW EXECUTE FUNCTION prevent_attendance_event_mutation();
