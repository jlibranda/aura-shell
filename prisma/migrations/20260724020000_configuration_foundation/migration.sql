-- CreateTable
CREATE TABLE "configuration_definitions" (
    "definition_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "scope_type" TEXT NOT NULL DEFAULT 'TENANT',
    "scope_ref" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "configuration_definitions_pkey" PRIMARY KEY ("definition_id")
);

-- CreateTable
CREATE TABLE "configuration_versions" (
    "version_id" TEXT NOT NULL,
    "definition_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "version_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "effective_from" TIMESTAMPTZ(6),
    "effective_until" TIMESTAMPTZ(6),
    "payload" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "change_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "published_by" TEXT,
    "retired_at" TIMESTAMPTZ(6),

    CONSTRAINT "configuration_versions_pkey" PRIMARY KEY ("version_id")
);

-- CreateIndex
CREATE INDEX "configuration_definitions_tenant_id_type_idx" ON "configuration_definitions"("tenant_id", "type");

-- CreateIndex
CREATE UNIQUE INDEX "configuration_definitions_tenant_id_code_key" ON "configuration_definitions"("tenant_id", "code");

-- CreateIndex
CREATE INDEX "configuration_versions_tenant_id_definition_id_status_idx" ON "configuration_versions"("tenant_id", "definition_id", "status");

-- CreateIndex
CREATE INDEX "configuration_versions_tenant_id_definition_id_effective_fr_idx" ON "configuration_versions"("tenant_id", "definition_id", "effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "configuration_versions_definition_id_version_number_key" ON "configuration_versions"("definition_id", "version_number");

-- AddForeignKey
ALTER TABLE "configuration_definitions" ADD CONSTRAINT "configuration_definitions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuration_versions" ADD CONSTRAINT "configuration_versions_definition_id_fkey" FOREIGN KEY ("definition_id") REFERENCES "configuration_definitions"("definition_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "configuration_versions" ADD CONSTRAINT "configuration_versions_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Valid lifecycle values only.
ALTER TABLE "configuration_versions" ADD CONSTRAINT "configuration_versions_status_check" CHECK (status IN ('DRAFT', 'PUBLISHED', 'RETIRED'));

-- Valid effective-date ordering when both bounds are present.
ALTER TABLE "configuration_versions" ADD CONSTRAINT "configuration_versions_effective_range_check" CHECK (effective_until IS NULL OR effective_from IS NULL OR effective_until > effective_from);

-- At most one DRAFT per definition (this slice does not support parallel drafts).
CREATE UNIQUE INDEX "configuration_versions_one_draft_per_definition" ON "configuration_versions" ("definition_id") WHERE status = 'DRAFT';

-- Published/retired versions are immutable at the database level, not only in
-- application code. The single allowed mutation on an already-published row
-- is the system-driven PUBLISHED -> RETIRED transition performed when a newer
-- version is published (see PrismaConfigurationUnitOfWork); nothing else may
-- ever change once a version leaves DRAFT.
CREATE FUNCTION prevent_configuration_version_mutation() RETURNS trigger AS $$
BEGIN
  IF OLD.status = 'PUBLISHED' AND NEW.status = 'RETIRED' THEN
    IF NEW.payload IS DISTINCT FROM OLD.payload
       OR NEW.effective_from IS DISTINCT FROM OLD.effective_from
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.published_by IS DISTINCT FROM OLD.published_by
       OR NEW.version_number IS DISTINCT FROM OLD.version_number THEN
      RAISE EXCEPTION 'configuration_versions: only status and retired_at may change when retiring a published version';
    END IF;
    RETURN NEW;
  END IF;
  IF OLD.status IN ('PUBLISHED', 'RETIRED') THEN
    RAISE EXCEPTION 'configuration_versions rows with status PUBLISHED or RETIRED are immutable';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER configuration_versions_prevent_mutation
BEFORE UPDATE ON "configuration_versions"
FOR EACH ROW EXECUTE FUNCTION prevent_configuration_version_mutation();
