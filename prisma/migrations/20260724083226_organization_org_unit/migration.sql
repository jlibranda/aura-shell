-- CreateTable
CREATE TABLE "org_units" (
    "org_unit_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "parent_id" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "org_units_pkey" PRIMARY KEY ("org_unit_id")
);

-- CreateIndex
CREATE INDEX "org_units_tenant_id_parent_id_idx" ON "org_units"("tenant_id", "parent_id");

-- CreateIndex
CREATE INDEX "org_units_tenant_id_status_idx" ON "org_units"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "org_units_tenant_id_org_unit_id_key" ON "org_units"("tenant_id", "org_unit_id");

-- CreateIndex
CREATE UNIQUE INDEX "org_units_tenant_id_code_key" ON "org_units"("tenant_id", "code");

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_tenant_id_parent_id_fkey" FOREIGN KEY ("tenant_id", "parent_id") REFERENCES "org_units"("tenant_id", "org_unit_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Valid kind values only (single typed aggregate; one recursive node, never a table per level).
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_kind_check" CHECK (kind IN ('DIVISION', 'BUSINESS_UNIT', 'DEPARTMENT', 'BRANCH', 'TEAM'));

-- Valid lifecycle status only.
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_status_check" CHECK (status IN ('ACTIVE', 'ARCHIVED'));

-- A unit can never be its own parent (the trivial cycle). Deeper cycles are
-- prevented in the write service, which rejects reparenting a unit beneath one
-- of its own descendants (computed in-transaction against the live tree).
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_no_self_parent_check" CHECK (parent_id IS NULL OR parent_id <> org_unit_id);
