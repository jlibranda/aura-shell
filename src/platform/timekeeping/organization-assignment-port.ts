/**
 * The smallest read-only, transaction-scoped view Timekeeping needs into
 * Organization's Assignment data for the ADR-014 §4.2 cross-aggregate
 * invariant: "does this person have an Organization Assignment placement in
 * force on this specific date." Deliberately not the full AssignmentRecord —
 * ScheduleAssignment never snapshots placement fields (ADR-014 §5.4) — and
 * deliberately not permission-gated: the caller has already passed
 * timekeeping.manage at the service layer, and re-requiring
 * organization.view here would be an undocumented second permission this
 * slice is not authorized to introduce (Slice 4 Decision 12).
 *
 * Implementations must read inside the same Prisma.TransactionClient the
 * ScheduleAssignment write uses (Slice 4 Decision 9) — never a separate
 * connection, service call, or consistency snapshot.
 */
export interface OrganizationAssignmentAsOfPort {
  /** Whether the person has a primary Organization Assignment placement in force at `asOf` — half-open [effectiveFrom, effectiveUntil), matching Assignment's own window semantics. */
  hasApplicableAssignmentAsOf(tenantId: string, personId: string, asOf: string): Promise<boolean>;
}
