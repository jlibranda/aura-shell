-- Timekeeping Slice 5 Phase A (ADR-014 §4.7): AttendancePolicy — the
-- configurable, scoped rule set governing how AttendanceEvents become an
-- AttendanceDay result. This slice's application code only ever writes
-- scope='TENANT'; the full five-value scope enum is modeled here unmodified
-- so Slice 7 can unlock the other four scopes without a shape change. No
-- AttendanceDay or attendance-calculation table is part of this migration.
--
-- The four "ALTER TABLE ... DROP DEFAULT" statements `prisma migrate dev
-- --create-only` proposed against attendance_events, schedule_assignments,
-- work_schedule_versions, and work_schedules are pre-existing drift between
-- those frozen tables' hand-written `gen_random_uuid()` DB defaults and
-- Prisma's `@default(uuid())` schema annotation (a client-side default, not
-- a DB one) — unrelated to this slice and deliberately excluded here so
-- this migration touches nothing outside attendance_policies.

-- CreateTable
CREATE TABLE "attendance_policies" (
    "policy_id" TEXT NOT NULL,
    "policy_version_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "scope_id" TEXT NOT NULL,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_until" TIMESTAMPTZ(6),
    "rounding_interval_minutes" INTEGER NOT NULL,
    "rounding_direction" TEXT NOT NULL,
    "grace_period_minutes" INTEGER NOT NULL,
    "lateness_tolerance_minutes" INTEGER NOT NULL,
    "unpaid_break_minutes" INTEGER,
    "standard_work_week_minutes" INTEGER NOT NULL,
    "is_standard_work_week_statutory_floor" BOOLEAN NOT NULL,
    "daily_overtime_threshold_minutes" INTEGER,
    "calculation_algorithm_version" INTEGER NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "change_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,

    CONSTRAINT "attendance_policies_pkey" PRIMARY KEY ("policy_version_id")
);

-- CreateIndex
CREATE INDEX "attendance_policies_tenant_id_scope_scope_id_effective_from_idx" ON "attendance_policies"("tenant_id", "scope", "scope_id", "effective_from");

-- CreateIndex
CREATE INDEX "attendance_policies_tenant_id_policy_id_idx" ON "attendance_policies"("tenant_id", "policy_id");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_policies_tenant_id_policy_version_id_key" ON "attendance_policies"("tenant_id", "policy_version_id");

-- AddForeignKey
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: the policy window must be non-empty (end strictly after
-- start) — same discipline as ScheduleAssignment/Assignment.
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_valid_window_check" CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from");

-- CheckConstraint: scope must be one of ADR-014 §4.7's five recognized values, even though this slice's application code only ever writes TENANT.
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_scope_check" CHECK ("scope" IN ('TENANT', 'LEGAL_ENTITY', 'LOCATION', 'ORG_UNIT', 'EMPLOYEE'));

-- CheckConstraint: for a TENANT-scope row, scope_id must equal tenant_id — there is exactly one Tenant scope per tenant, so the two identifiers coincide by construction, never by convention alone.
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_tenant_scope_id_check" CHECK ("scope" <> 'TENANT' OR "scope_id" = "tenant_id");

-- CheckConstraint: rounding_direction must be one of the three approved (lowercase) directions.
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_rounding_direction_check" CHECK ("rounding_direction" IN ('nearest', 'up', 'down'));

-- CheckConstraint: rounding_interval_minutes must be strictly positive — the
-- approved contract requires roundingIntervalMinutes > 0 and does not
-- authorize any divisibility restriction on top of it.
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_rounding_interval_positive_check" CHECK ("rounding_interval_minutes" > 0);

-- CheckConstraint: every other duration/threshold value is a non-negative
-- number of minutes when present; unpaid_break_minutes and
-- daily_overtime_threshold_minutes are nullable per the approved contract's
-- optionality, so a NULL is always allowed alongside a non-negative value.
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_non_negative_minutes_check" CHECK (
    "grace_period_minutes" >= 0
    AND "lateness_tolerance_minutes" >= 0
    AND ("unpaid_break_minutes" IS NULL OR "unpaid_break_minutes" >= 0)
    AND "standard_work_week_minutes" >= 0
    AND ("daily_overtime_threshold_minutes" IS NULL OR "daily_overtime_threshold_minutes" >= 0)
);

-- ExclusionConstraint: for the same (tenant, scope, scope_id), policy
-- versions must not overlap. Windows are half-open [effective_from,
-- effective_until) so a replacement that starts the instant the prior
-- version ends is not treated as an overlap (ADR-014 §4.7's "at most one
-- active policy per scope+scopeId at a given instant" invariant). Relies on
-- btree_gist, already installed by the Assignment migration
-- (20260724135035_organization_assignment).
ALTER TABLE "attendance_policies" ADD CONSTRAINT "attendance_policies_no_overlap_excl" EXCLUDE USING gist (
    "tenant_id" WITH =,
    "scope" WITH =,
    "scope_id" WITH =,
    tstzrange("effective_from", "effective_until", '[)') WITH &&
);
