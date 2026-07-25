import type { LocationRecord } from "@/platform/organization/location";

/**
 * Read-only analysis for the legacy Employee.workLocation -> Assignment.locationId
 * backfill (see docs/roadmap — Location Assignment migration proposal). Never
 * writes anything: it only classifies each legacy free-text value against the
 * tenant's real Location master data so a human can decide what to do with
 * the unmatched and ambiguous cases. Exact matches are the only ones a
 * caller may safely apply automatically — ambiguous values must never be
 * auto-mapped.
 */
export type LegacyWorkLocationMatchKind = "exact" | "unmatched" | "ambiguous";

export interface LegacyWorkLocationCandidate {
  employeeId: string;
  workLocation: string;
}

export interface LegacyWorkLocationMatch {
  employeeId: string;
  workLocation: string;
  kind: LegacyWorkLocationMatchKind;
  /** Set only when kind === "exact" — the one Location this value unambiguously names. */
  matchedLocationId?: string;
  /** Set only when kind === "ambiguous" — every Location this value could name. */
  candidateLocationIds?: string[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

/**
 * Matches one legacy value against a tenant's Locations by exact (case- and
 * whitespace-insensitive) equality to either the Location's name or its
 * code — never a fuzzy or partial match, since a wrong automatic mapping is
 * worse than leaving a value for manual review.
 */
function matchOne(workLocation: string, locations: readonly Pick<LocationRecord, "id" | "name" | "code">[]): Pick<LocationRecord, "id" | "name" | "code">[] {
  const target = normalize(workLocation);
  return locations.filter((location) => normalize(location.name) === target || normalize(location.code) === target);
}

/**
 * Classifies each candidate's legacy workLocation against the tenant's
 * Location master data. Callers are expected to have already filtered
 * candidates down to employees with no Assignment.locationId yet — this
 * function only does the matching, not the "who needs backfilling" query.
 */
export function classifyLegacyWorkLocations(
  candidates: readonly LegacyWorkLocationCandidate[],
  locations: readonly Pick<LocationRecord, "id" | "name" | "code">[],
): LegacyWorkLocationMatch[] {
  return candidates.map((candidate) => {
    const matches = matchOne(candidate.workLocation, locations);
    if (matches.length === 1) {
      return { employeeId: candidate.employeeId, workLocation: candidate.workLocation, kind: "exact" as const, matchedLocationId: matches[0].id };
    }
    if (matches.length === 0) {
      return { employeeId: candidate.employeeId, workLocation: candidate.workLocation, kind: "unmatched" as const };
    }
    return { employeeId: candidate.employeeId, workLocation: candidate.workLocation, kind: "ambiguous" as const, candidateLocationIds: matches.map((location) => location.id) };
  });
}

export interface LegacyWorkLocationBackfillReport {
  exact: LegacyWorkLocationMatch[];
  unmatched: LegacyWorkLocationMatch[];
  ambiguous: LegacyWorkLocationMatch[];
}

/** Groups classified matches into the three review buckets a migration operator needs: apply automatically, needs a new Location, needs manual disambiguation. */
export function summarizeLegacyWorkLocationMatches(matches: readonly LegacyWorkLocationMatch[]): LegacyWorkLocationBackfillReport {
  return {
    exact: matches.filter((match) => match.kind === "exact"),
    unmatched: matches.filter((match) => match.kind === "unmatched"),
    ambiguous: matches.filter((match) => match.kind === "ambiguous"),
  };
}
