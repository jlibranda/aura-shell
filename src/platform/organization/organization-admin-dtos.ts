/**
 * Pure display DTOs for the Settings > Organization admin UI (Epic 7B.5).
 * Deliberately outside `src/platform/organization/admin/` (which is
 * server-only, blocked for client components) — this file holds no logic
 * and no server-only import, so client components may import it directly.
 */
export interface AssignmentAdminRow {
  assignmentId: string;
  personId: string;
  personName: string;
  orgUnitId: string;
  orgUnitName: string;
  managerId?: string;
  managerName?: string;
  effectiveFrom: string;
}
