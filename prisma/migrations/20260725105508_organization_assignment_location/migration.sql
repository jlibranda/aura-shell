-- AlterTable
ALTER TABLE "assignments" ADD COLUMN     "location_id" TEXT;

-- CreateIndex
CREATE INDEX "assignments_tenant_id_location_id_idx" ON "assignments"("tenant_id", "location_id");

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_tenant_id_location_id_fkey" FOREIGN KEY ("tenant_id", "location_id") REFERENCES "locations"("tenant_id", "location_id") ON DELETE RESTRICT ON UPDATE CASCADE;
