import { describe, expect, it } from "vitest";
import { classifyLegacyWorkLocations, summarizeLegacyWorkLocationMatches, type LegacyWorkLocationCandidate } from "@/platform/people/legacy-work-location-backfill";
import type { LocationRecord } from "@/platform/organization/location";

function loc(overrides: Partial<Pick<LocationRecord, "id" | "name" | "code">> = {}): Pick<LocationRecord, "id" | "name" | "code"> {
  return { id: "loc1", name: "Manila HQ", code: "MNL", ...overrides };
}

describe("classifyLegacyWorkLocations — exact matches", () => {
  it("matches a legacy value against a Location's name", () => {
    const [match] = classifyLegacyWorkLocations([{ employeeId: "e1", workLocation: "Manila HQ" }], [loc()]);
    expect(match).toEqual({ employeeId: "e1", workLocation: "Manila HQ", kind: "exact", matchedLocationId: "loc1" });
  });

  it("matches a legacy value against a Location's code", () => {
    const [match] = classifyLegacyWorkLocations([{ employeeId: "e1", workLocation: "MNL" }], [loc()]);
    expect(match.kind).toBe("exact");
    expect(match.matchedLocationId).toBe("loc1");
  });

  it("matches case- and whitespace-insensitively", () => {
    const [match] = classifyLegacyWorkLocations([{ employeeId: "e1", workLocation: "  manila hq  " }], [loc()]);
    expect(match.kind).toBe("exact");
    expect(match.matchedLocationId).toBe("loc1");
  });
});

describe("classifyLegacyWorkLocations — unmatched", () => {
  it("classifies a value that matches no Location as unmatched, with no matched or candidate ids", () => {
    const [match] = classifyLegacyWorkLocations([{ employeeId: "e1", workLocation: "Cebu Office" }], [loc()]);
    expect(match.kind).toBe("unmatched");
    expect(match).not.toHaveProperty("matchedLocationId");
    expect(match).not.toHaveProperty("candidateLocationIds");
  });

  it("classifies an empty roster of locations as entirely unmatched", () => {
    const results = classifyLegacyWorkLocations([{ employeeId: "e1", workLocation: "Manila HQ" }], []);
    expect(results[0].kind).toBe("unmatched");
  });
});

describe("classifyLegacyWorkLocations — ambiguous values are never auto-mapped", () => {
  it("classifies a value matching more than one Location as ambiguous, listing every candidate, with no single matchedLocationId", () => {
    // "HQ" is simultaneously one location's exact name and a different location's exact code.
    const locations = [loc({ id: "loc1", name: "HQ", code: "MNL-HQ" }), loc({ id: "loc2", name: "Cebu Branch", code: "HQ" })];
    const [match] = classifyLegacyWorkLocations([{ employeeId: "e1", workLocation: "HQ" }], locations);
    expect(match.kind).toBe("ambiguous");
    expect(match).not.toHaveProperty("matchedLocationId");
    expect(match.candidateLocationIds).toEqual(expect.arrayContaining(["loc1", "loc2"]));
    expect(match.candidateLocationIds).toHaveLength(2);
  });
});

describe("classifyLegacyWorkLocations — mixed roster", () => {
  const locations = [loc({ id: "loc1", name: "Manila HQ", code: "MNL" }), loc({ id: "loc2", name: "HQ", code: "AMB" }), loc({ id: "loc3", name: "Cebu Branch", code: "HQ" })];
  const candidates: LegacyWorkLocationCandidate[] = [
    { employeeId: "e1", workLocation: "Manila HQ" }, // exact
    { employeeId: "e2", workLocation: "Baguio Office" }, // unmatched
    { employeeId: "e3", workLocation: "HQ" }, // ambiguous: loc2.name and loc3.code both "HQ"
  ];

  it("classifies each candidate independently in input order", () => {
    const results = classifyLegacyWorkLocations(candidates, locations);
    expect(results.map((r) => r.kind)).toEqual(["exact", "unmatched", "ambiguous"]);
  });

  it("summarizes into exact / unmatched / ambiguous buckets — unmatched and ambiguous values never appear in the exact (auto-appliable) bucket", () => {
    const results = classifyLegacyWorkLocations(candidates, locations);
    const summary = summarizeLegacyWorkLocationMatches(results);
    expect(summary.exact.map((r) => r.employeeId)).toEqual(["e1"]);
    expect(summary.unmatched.map((r) => r.employeeId)).toEqual(["e2"]);
    expect(summary.ambiguous.map((r) => r.employeeId)).toEqual(["e3"]);
    expect(summary.exact.every((r) => r.matchedLocationId)).toBe(true);
    expect(summary.exact.some((r) => r.employeeId === "e3")).toBe(false);
  });
});
