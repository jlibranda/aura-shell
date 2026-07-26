import type { TrustedRequestContext } from "@/platform/runtime-context";
import type { CurrentPersonResolution, CurrentPersonResolver } from "@/platform/timekeeping/current-person-resolver";

/**
 * Test-only stand-in for the not-yet-built production CurrentPersonResolver
 * (Slice 2 Decision 3). Resolves to a fixed personId, or stays unresolved
 * when none is given — used to exercise both branches of
 * AttendanceIngestionService.recordOwnAttendanceEvent without a real
 * People-side identity link.
 */
export class FixedCurrentPersonResolver implements CurrentPersonResolver {
  constructor(private readonly personId?: string) {}

  async resolveCurrentPerson(_request: TrustedRequestContext): Promise<CurrentPersonResolution> {
    return this.personId ? Object.freeze({ kind: "resolved" as const, personId: this.personId }) : Object.freeze({ kind: "unresolved" as const });
  }
}
