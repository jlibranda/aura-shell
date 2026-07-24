-- CreateTable
CREATE TABLE "assignments" (
    "assignment_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "person_id" TEXT NOT NULL,
    "org_unit_id" TEXT NOT NULL,
    "manager_id" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT true,
    "effective_from" TIMESTAMPTZ(6) NOT NULL,
    "effective_until" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("assignment_id")
);

-- CreateIndex
CREATE INDEX "assignments_tenant_id_person_id_effective_from_idx" ON "assignments"("tenant_id", "person_id", "effective_from");

-- CreateIndex
CREATE INDEX "assignments_tenant_id_org_unit_id_idx" ON "assignments"("tenant_id", "org_unit_id");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_person_id_fkey" FOREIGN KEY ("tenant_id", "person_id") REFERENCES "employees"("tenant_id", "employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_manager_id_fkey" FOREIGN KEY ("tenant_id", "manager_id") REFERENCES "employees"("tenant_id", "employee_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_org_unit_id_fkey" FOREIGN KEY ("tenant_id", "org_unit_id") REFERENCES "org_units"("tenant_id", "org_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CheckConstraint: a person can never be their own manager.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_manager_not_self_check" CHECK ("manager_id" IS NULL OR "manager_id" <> "person_id");

-- CheckConstraint: the placement window must be non-empty (end strictly after start).
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_valid_window_check" CHECK ("effective_until" IS NULL OR "effective_until" > "effective_from");

-- Required for the exclusion constraint below: GIST support for equality (=) operators on scalar types.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ExclusionConstraint: at most one PRIMARY assignment may be in force for a
-- given (tenant, person) at any instant. Windows are half-open
-- [effective_from, effective_until) so a transfer that starts the instant the
-- prior placement ends is not treated as an overlap. Applies only to primary
-- rows; secondary/acting placements (out of scope this slice) are unaffected.
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_one_primary_in_force_excl" EXCLUDE USING gist (
    "tenant_id" WITH =,
    "person_id" WITH =,
    tstzrange("effective_from", "effective_until", '[)') WITH &&
) WHERE ("is_primary");

-- Index: fast lookup of each person's current (still-open) placement.
CREATE INDEX "assignments_tenant_id_person_id_current_idx" ON "assignments"("tenant_id", "person_id") WHERE "effective_until" IS NULL;
