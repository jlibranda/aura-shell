-- Timekeeping Slice 3 (ADR-014 §4.1): WorkSchedule — a reusable,
-- tenant-scoped schedule template split into a stable definition
-- (work_schedules) and versioned, computation-relevant content
-- (work_schedule_versions). No ScheduleAssignment, AttendanceDay,
-- attendance calculation, or policy hierarchy is part of this migration —
-- see docs/roadmap/timekeeping-implementation-plan.md.

CREATE TABLE "work_schedules" (
    "work_schedule_id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("work_schedule_id")
);

CREATE TABLE "work_schedule_versions" (
    "work_schedule_version_id" TEXT NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" TEXT NOT NULL,
    "work_schedule_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "schedule_type" TEXT NOT NULL,
    "timezone_resolution_mode" TEXT NOT NULL,
    "timezone" TEXT,
    "weekly_pattern" JSONB NOT NULL,
    "canonical_hash" TEXT NOT NULL,
    "change_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "activated_at" TIMESTAMPTZ(6),
    "retired_at" TIMESTAMPTZ(6),

    CONSTRAINT "work_schedule_versions_pkey" PRIMARY KEY ("work_schedule_version_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_schedules_tenant_id_work_schedule_id_key" ON "work_schedules"("tenant_id", "work_schedule_id");

-- CreateIndex: WorkSchedule.code is permanent business identity (Slice 3 Decision 2).
CREATE UNIQUE INDEX "work_schedules_tenant_id_code_key" ON "work_schedules"("tenant_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedule_versions_tenant_id_work_schedule_version_id_key" ON "work_schedule_versions"("tenant_id", "work_schedule_version_id");

-- CreateIndex
CREATE UNIQUE INDEX "work_schedule_versions_work_schedule_id_version_number_key" ON "work_schedule_versions"("work_schedule_id", "version_number");

-- CreateIndex
CREATE INDEX "work_schedule_versions_tenant_id_work_schedule_id_status_idx" ON "work_schedule_versions"("tenant_id", "work_schedule_id", "status");

-- CreateIndex: the database-level enforcement of "at most one ACTIVE
-- version per WorkSchedule" (Slice 3 Decision 8) — Prisma's declarative
-- schema syntax cannot express a partial unique index, the same reason
-- Assignment's GIST exclusion constraint is hand-written SQL here too.
CREATE UNIQUE INDEX "work_schedule_versions_one_active_per_schedule"
ON "work_schedule_versions"("work_schedule_id")
WHERE "status" = 'ACTIVE';

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_schedule_versions" ADD CONSTRAINT "work_schedule_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey: composite tenant-scoped FK — ensures a WorkScheduleVersion
-- can never reference a WorkSchedule belonging to a different tenant,
-- enforced at the database, not application code alone (Slice 3
-- persistence requirement). Same pattern as attendance_events -> employees.
ALTER TABLE "work_schedule_versions" ADD CONSTRAINT "work_schedule_versions_tenant_id_work_schedule_id_fkey" FOREIGN KEY ("tenant_id", "work_schedule_id") REFERENCES "work_schedules"("tenant_id", "work_schedule_id") ON DELETE RESTRICT ON UPDATE CASCADE;
