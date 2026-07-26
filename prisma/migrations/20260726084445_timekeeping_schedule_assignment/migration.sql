-- Timekeeping Slice 4 (ADR-014 §4.2): ScheduleAssignment — the
-- effective-dated binding of one immutable WorkScheduleVersion to one
-- person. No AttendanceDay, attendance calculation, or policy hierarchy is
-- part of this migration — see docs/roadmap/timekeeping-implementation-plan.md.

-- CreateTable
CREATE TABLE "schedule_assignments" (
    "schedule_assignment_id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "work_schedule_id" TEXT NOT NULL,
    "work_schedule_version_id" TEXT NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_until" TIMESTAMPTZ(6),
    "change_reason" TEXT,
    "cancelled_at" TIMESTAMPTZ(6),
    "cancelled_by" TEXT,
    "cancellation_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "schedule_assignments_pkey" PRIMARY KEY ("schedule_assignment_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "schedule_assignments_tenant_id_schedule_assignment_id_key" ON "schedule_assignments"("tenant_id", "schedule_assignment_id");

-- CreateIndex
CREATE INDEX "schedule_assignments_tenant_id_person_id_effective_from_idx" ON "schedule_assignments"("tenant_id", "person_id", "effective_from");

-- CreateIndex
CREATE INDEX "schedule_assignments_tenant_id_work_schedule_version_id_idx" ON "schedule_assignments"("tenant_id", "work_schedule_version_id");

-- CreateIndex: fast lookup of each person's current (still-open,
-- non-cancelled) assignment (Slice 4 Decision 14, item 10).
CREATE INDEX "schedule_assignments_tenant_id_person_id_current_idx" ON "schedule_assignments"("tenant_id", "person_id") WHERE "effective_until" IS NULL AND "cancelled_at" IS NULL;

-- CreateIndex: Slice 4 Decision 3 — enables the composite
-- (tenant_id, work_schedule_id, work_schedule_version_id) foreign key below,
-- so the database itself enforces "the referenced version belongs to the
-- referenced WorkSchedule." Index-only addition to the frozen Slice 3
-- work_schedule_versions table — no column, data, or behavior change.
CREATE UNIQUE INDEX "work_schedule_versions_tenant_id_work_schedule_id_work_sche_key" ON "work_schedule_versions"("tenant_id", "work_schedule_id", "work_schedule_version_id");

-- CheckConstraint: the assignment window must be non-empty (end strictly
-- after start) — same discipline as Assignment (Slice 4 Decision 5).
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_valid_window_check" CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from");

-- ExclusionConstraint: for the same (tenant, person), non-cancelled
-- ScheduleAssignments must not overlap. Windows are half-open
-- [effective_from, effective_until) so a transfer that starts the instant
-- the prior assignment ends is not treated as an overlap. Cancelled
-- assignments never participate (Slice 4 Decision 6/7) — the WHERE clause
-- keeps a cancelled future assignment from blocking a later replacement.
-- Relies on btree_gist, already installed by the Assignment migration
-- (20260724135035_organization_assignment).
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_no_overlap_excl" EXCLUDE USING gist (
    "tenant_id" WITH =,
    "person_id" WITH =,
    tstzrange("effective_from", "effective_until", '[)') WITH &&
) WHERE ("cancelled_at" IS NULL);

-- AddForeignKey
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: composite tenant-scoped FK — same pattern as
-- assignments_tenant_id_person_id_fkey / attendance_events_tenant_id_person_id_fkey.
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_tenant_id_person_id_fkey" FOREIGN KEY ("tenant_id", "person_id") REFERENCES "employees"("tenant_id", "employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: composite tenant-scoped FK to WorkSchedule.
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_tenant_id_work_schedule_id_fkey" FOREIGN KEY ("tenant_id", "work_schedule_id") REFERENCES "work_schedules"("tenant_id", "work_schedule_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: composite tenant+work-schedule+version FK — the database
-- enforcement of Slice 4 Decision 3 ("the assignment must pin a specific
-- immutable WorkScheduleVersion... never dynamically follow the currently
-- ACTIVE version") and the persistence requirement that the referenced
-- version actually belongs to the referenced WorkSchedule.
ALTER TABLE "schedule_assignments" ADD CONSTRAINT "schedule_assignments_tenant_id_work_schedule_id_work_sched_fkey" FOREIGN KEY ("tenant_id", "work_schedule_id", "work_schedule_version_id") REFERENCES "work_schedule_versions"("tenant_id", "work_schedule_id", "work_schedule_version_id") ON DELETE RESTRICT ON UPDATE CASCADE;
