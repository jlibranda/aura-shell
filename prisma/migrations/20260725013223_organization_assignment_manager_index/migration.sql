-- Index: fast lookup of a manager's current direct reports (Epic 7B.4
-- Organization Query & People Integration). Mirrors the existing
-- assignments_tenant_id_person_id_current_idx pattern — a partial index over
-- only currently-open assignments, since "direct reports" always means the
-- present-day org chart, not history.
CREATE INDEX "assignments_tenant_id_manager_id_current_idx" ON "assignments"("tenant_id", "manager_id") WHERE "effective_until" IS NULL;
