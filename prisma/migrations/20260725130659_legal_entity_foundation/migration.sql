-- Legal Entity foundation (ADR-013). Adds the LegalEntity aggregate and makes
-- OrgUnit/Assignment ownership by a Legal Entity a real, enforced foreign key
-- rather than an optional attribute. Every tenant that already has OrgUnits
-- or Assignments is backfilled with one deterministic, migration-created
-- "Legacy Legal Entity" (code LEGACY) so the NOT NULL/FK invariants below can
-- be established in this same migration — there is no intermediate nullable
-- state left behind. This block is idempotent: re-running it is a no-op once
-- the LEGACY entity and the backfilled references already exist.

-- CreateTable
CREATE TABLE "legal_entities" (
    "legal_entity_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "legal_entities_pkey" PRIMARY KEY ("legal_entity_id")
);

-- CreateIndex
CREATE INDEX "legal_entities_tenant_id_status_idx" ON "legal_entities"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "legal_entities_tenant_id_legal_entity_id_key" ON "legal_entities"("tenant_id", "legal_entity_id");

-- CreateIndex
CREATE UNIQUE INDEX "legal_entities_tenant_id_code_key" ON "legal_entities"("tenant_id", "code");

-- AddForeignKey
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Valid lifecycle status only.
ALTER TABLE "legal_entities" ADD CONSTRAINT "legal_entities_status_check" CHECK (status IN ('ACTIVE', 'ARCHIVED'));

-- Backfill: one migration-created "Legacy Legal Entity" per tenant that
-- already has OrgUnits or Assignments. country_code is derived from that
-- tenant's existing Location data only when it is unambiguous (exactly one
-- distinct country_code across the tenant's locations); otherwise "XX"
-- (ISO 3166-1 user-assigned "unknown/unspecified" convention) is used rather
-- than guessing a real jurisdiction. created_by clearly identifies the row
-- as migration-created so a tenant administrator knows to review/rename it.
DO $$
DECLARE
  t RECORD;
  derived_country TEXT;
  new_entity_id TEXT;
BEGIN
  FOR t IN
    SELECT DISTINCT tenant_id FROM (
      SELECT tenant_id FROM "org_units"
      UNION
      SELECT tenant_id FROM "assignments"
    ) AS tenants_needing_backfill
  LOOP
    IF NOT EXISTS (SELECT 1 FROM "legal_entities" WHERE "tenant_id" = t.tenant_id AND "code" = 'LEGACY') THEN
      SELECT CASE WHEN COUNT(DISTINCT "country_code") = 1 THEN MIN("country_code") ELSE 'XX' END
        INTO derived_country
        FROM "locations"
        WHERE "tenant_id" = t.tenant_id;

      new_entity_id := gen_random_uuid()::text;

      INSERT INTO "legal_entities" ("legal_entity_id", "tenant_id", "code", "legal_name", "country_code", "status", "created_by", "updated_at")
      VALUES (new_entity_id, t.tenant_id, 'LEGACY', 'Legacy Legal Entity', COALESCE(derived_country, 'XX'), 'ACTIVE', 'system:legal-entity-backfill', CURRENT_TIMESTAMP);
    END IF;
  END LOOP;
END $$;

-- AlterTable (nullable first — the UPDATE below fills every existing row
-- before the NOT NULL constraint is added; this is not the final state)
ALTER TABLE "org_units" ADD COLUMN "legal_entity_id" TEXT;

UPDATE "org_units" ou
SET "legal_entity_id" = le."legal_entity_id"
FROM "legal_entities" le
WHERE le."tenant_id" = ou."tenant_id" AND le."code" = 'LEGACY' AND ou."legal_entity_id" IS NULL;

ALTER TABLE "org_units" ALTER COLUMN "legal_entity_id" SET NOT NULL;

-- AlterTable (nullable first, same reasoning as org_units above)
ALTER TABLE "assignments" ADD COLUMN "legal_entity_id" TEXT;

-- Derived from each Assignment's own OrgUnit (not independently per tenant),
-- so "each Assignment's OrgUnit must belong to the same Legal Entity" holds
-- by construction rather than by coincidence.
UPDATE "assignments" a
SET "legal_entity_id" = ou."legal_entity_id"
FROM "org_units" ou
WHERE ou."tenant_id" = a."tenant_id" AND ou."org_unit_id" = a."org_unit_id" AND a."legal_entity_id" IS NULL;

ALTER TABLE "assignments" ALTER COLUMN "legal_entity_id" SET NOT NULL;

-- CreateIndex
CREATE INDEX "org_units_tenant_id_legal_entity_id_idx" ON "org_units"("tenant_id", "legal_entity_id");

-- CreateIndex
CREATE INDEX "assignments_tenant_id_legal_entity_id_idx" ON "assignments"("tenant_id", "legal_entity_id");

-- AddForeignKey
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_tenant_id_legal_entity_id_fkey" FOREIGN KEY ("tenant_id", "legal_entity_id") REFERENCES "legal_entities"("tenant_id", "legal_entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_legal_entity_id_fkey" FOREIGN KEY ("tenant_id", "legal_entity_id") REFERENCES "legal_entities"("tenant_id", "legal_entity_id") ON DELETE RESTRICT ON UPDATE CASCADE;
