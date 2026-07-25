-- CreateTable
CREATE TABLE "locations" (
    "location_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address_line1" TEXT NOT NULL,
    "address_line2" TEXT,
    "city" TEXT NOT NULL,
    "region" TEXT,
    "postal_code" TEXT,
    "country_code" TEXT NOT NULL,
    "timezone" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" TEXT NOT NULL,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "archived_at" TIMESTAMPTZ(6),

    CONSTRAINT "locations_pkey" PRIMARY KEY ("location_id")
);

-- CreateIndex
CREATE INDEX "locations_tenant_id_status_idx" ON "locations"("tenant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "locations_tenant_id_location_id_key" ON "locations"("tenant_id", "location_id");

-- CreateIndex
CREATE UNIQUE INDEX "locations_tenant_id_code_key" ON "locations"("tenant_id", "code");

-- AddForeignKey
ALTER TABLE "locations" ADD CONSTRAINT "locations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Valid lifecycle status only (mirrors org_units_status_check).
ALTER TABLE "locations" ADD CONSTRAINT "locations_status_check" CHECK (status IN ('ACTIVE', 'ARCHIVED'));
