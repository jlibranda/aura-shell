import type { TenantContext } from "@/platform/context";
import type { AttendancePolicyResolutionInput, AttendancePolicyResolutionResult } from "@/platform/timekeeping/attendance-policy";

/**
 * The sole seam AttendanceCalculationService (Slice 6) is allowed to depend
 * on for policy resolution (ADR-014 Slice 5 architecture decision gate).
 * Declared as a pure interface with no reference to any concrete
 * implementation — BaselineAttendancePolicyResolver is one conformant
 * implementation today; a full Tenant->LegalEntity->Location->OrgUnit->
 * Employee precedence resolver (Slice 7) is a second, against this exact
 * same interface, unchanged.
 */
export interface AttendancePolicyResolver {
  resolve(context: TenantContext, input: AttendancePolicyResolutionInput): Promise<AttendancePolicyResolutionResult>;
}
