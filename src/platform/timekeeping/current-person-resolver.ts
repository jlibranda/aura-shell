import type { TrustedRequestContext } from "@/platform/runtime-context";

/**
 * The boundary between People and Timekeeping for exactly one question:
 * "which Employee does this authenticated principal represent?" (Timekeeping
 * Slice 2 Decision 3).
 *
 * Timekeeping must never import People — the same one-way dependency
 * direction `people-must-not-import-timekeeping` already enforces in
 * reverse (import-boundaries.ts) — and must never know how a User is
 * mapped to an Employee; that mapping is a People-domain concern.
 * CurrentPersonResolver is the single seam through which
 * AttendanceIngestionService's self-clock path learns "who is this,"
 * without Timekeeping depending on People's identity model directly. This
 * interface is owned by Timekeeping (the consumer), the same convention
 * `OrganizationEmployeeDirectory`/`OrganizationPlacementService` already
 * establish elsewhere in this codebase: the consuming domain declares the
 * port it needs, not the domain that will eventually implement it.
 *
 * TODO(self-clock production resolver): no implementation exists yet, and
 * none is built in Slice 2. A `User` <-> `Employee` link does not currently
 * exist anywhere in the Prisma schema (`users` and `employees` have no
 * relation) — see the Slice 2 investigation report. Until a real resolver
 * is implemented (most likely a Prisma-backed adapter living wherever that
 * identity link eventually ships), self-clock
 * (`AttendanceIngestionService.recordOwnAttendanceEvent`) cannot be wired
 * to a real caller; it can only be exercised in tests against
 * `FixedCurrentPersonResolver` (test-doubles/current-person-resolver.ts).
 */
export type CurrentPersonResolution =
  | Readonly<{ kind: "resolved"; personId: string }>
  | Readonly<{ kind: "unresolved" }>;

export interface CurrentPersonResolver {
  /** Resolve the Employee identity represented by this authenticated principal, if any. */
  resolveCurrentPerson(request: TrustedRequestContext): Promise<CurrentPersonResolution>;
}
