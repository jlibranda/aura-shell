-- CreateTable
CREATE TABLE "tenants" (
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "tenants_pkey" PRIMARY KEY ("tenant_id")
);

-- CreateTable
CREATE TABLE "employees" (
    "tenant_id" TEXT NOT NULL,
    "employee_id" TEXT NOT NULL,
    "employee_number" TEXT NOT NULL,
    "display_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "last_name" TEXT NOT NULL,
    "preferred_name" TEXT,
    "date_of_birth" DATE NOT NULL,
    "gender" TEXT NOT NULL,
    "marital_status" TEXT NOT NULL,
    "nationality" TEXT NOT NULL,
    "work_email" TEXT NOT NULL,
    "personal_email" TEXT,
    "mobile_number" TEXT NOT NULL,
    "home_address" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "team_id" TEXT,
    "position" TEXT NOT NULL,
    "manager_id" TEXT,
    "employment_type" TEXT NOT NULL,
    "employment_status" TEXT,
    "hire_date" DATE NOT NULL,
    "work_location" TEXT NOT NULL,
    "emergency_contact_name" TEXT,
    "emergency_relationship" TEXT,
    "emergency_mobile_number" TEXT,
    "emergency_email" TEXT,
    "emergency_address" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "employees_pkey" PRIMARY KEY ("tenant_id", "employee_id")
);

-- CreateTable
CREATE TABLE "audit_records" (
    "audit_id" TEXT NOT NULL,
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "actor_user_id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "correlation_id" TEXT NOT NULL,
    "transaction_id" TEXT NOT NULL,
    "command_name" TEXT NOT NULL,
    "event_name" TEXT NOT NULL,
    "aggregate_type" TEXT NOT NULL,
    "aggregate_id" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    CONSTRAINT "audit_records_pkey" PRIMARY KEY ("audit_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "employees_tenant_id_employee_number_key" ON "employees"("tenant_id", "employee_number");
CREATE UNIQUE INDEX "employees_tenant_id_work_email_key" ON "employees"("tenant_id", "work_email");
CREATE INDEX "employees_tenant_id_last_name_first_name_idx" ON "employees"("tenant_id", "last_name", "first_name");
CREATE INDEX "employees_tenant_id_department_id_idx" ON "employees"("tenant_id", "department_id");
CREATE INDEX "audit_records_tenant_id_occurred_at_idx" ON "audit_records"("tenant_id", "occurred_at");
CREATE INDEX "audit_records_tenant_id_aggregate_type_aggregate_id_idx" ON "audit_records"("tenant_id", "aggregate_type", "aggregate_id");
CREATE INDEX "audit_records_correlation_id_idx" ON "audit_records"("correlation_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "audit_records" ADD CONSTRAINT "audit_records_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "tenants"("tenant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Audit records are append-only. Repository adapters must use INSERT only;
-- this trigger additionally prevents accidental SQL mutation.
CREATE FUNCTION prevent_audit_record_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_records are immutable';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_records_prevent_mutation
BEFORE UPDATE OR DELETE ON "audit_records"
FOR EACH ROW EXECUTE FUNCTION prevent_audit_record_mutation();
