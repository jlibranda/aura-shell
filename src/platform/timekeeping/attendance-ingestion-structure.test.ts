import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { ATTENDANCE_EVENT_SOURCES } from "@/platform/timekeeping/attendance-event";

/**
 * Structural guards for Slice 2: AttendanceIngestionService stays a thin,
 * channel-agnostic orchestration layer over the create-only AttendanceEvent
 * write path (ADR-014 §8; Slice 2 additional requirement's "Channel Rule").
 */
const REPO_ROOT = join(__dirname, "..", "..", "..");

function sourceFiles(): { path: string; content: string }[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === ".next" ? [] : walk(full);
      if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) return [full];
      return [];
    });
  return walk(join(REPO_ROOT, "src")).map((absolute) => ({
    path: relative(REPO_ROOT, absolute).split("\\").join("/"),
    content: readFileSync(absolute, "utf8"),
  }));
}

const FORBIDDEN_METHOD_NAMES = ["update", "delete", "archive", "restore", "end", "edit", "correct", "supersede"];

describe("AttendanceIngestionService stays create-only and channel-agnostic", () => {
  const files = sourceFiles();
  const serviceFile = files.find((f) => f.path === "src/platform/timekeeping/attendance-ingestion-service.ts");

  it("declares the AttendanceIngestionService class in exactly one file", () => {
    const declarers = files.filter((f) => /(export\s+)?class\s+AttendanceIngestionService\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/timekeeping/attendance-ingestion-service.ts"]);
  });

  it("gives AttendanceIngestionService no update/delete/archive/restore/end/edit/correct/supersede method", () => {
    expect(serviceFile).toBeDefined();
    const match = serviceFile!.content.match(/export class AttendanceIngestionService \{[\s\S]*/);
    expect(match).not.toBeNull();
    const block = match![0];
    for (const name of FORBIDDEN_METHOD_NAMES) {
      const methodPattern = new RegExp(`\\b(async\\s+)?${name}\\w*\\s*\\(`, "i");
      expect(block).not.toMatch(methodPattern);
    }
  });

  it("contains no attendance-event source value as a string literal — the Channel Rule (Slice 2): AttendanceIngress implementations may vary, AttendanceIngestionService must not", () => {
    expect(serviceFile).toBeDefined();
    for (const source of ATTENDANCE_EVENT_SOURCES) {
      const literalPattern = new RegExp(`["'\`]${source}["'\`]`);
      expect(serviceFile!.content).not.toMatch(literalPattern);
    }
  });

  it("never imports People (Timekeeping's existing one-way dependency direction)", () => {
    expect(serviceFile).toBeDefined();
    expect(serviceFile!.content).not.toMatch(/platform\/people\//);
  });
});

describe("CurrentPersonResolver is a boundary interface only, with no production implementation shipped this slice", () => {
  const files = sourceFiles();

  it("declares CurrentPersonResolver in Timekeeping, never in People", () => {
    const declarers = files.filter((f) => /interface\s+CurrentPersonResolver\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/timekeeping/current-person-resolver.ts"]);
  });

  it("has exactly one implementer, and it is the test double, not a production Prisma adapter", () => {
    const implementers = files.filter((f) => /implements\s+CurrentPersonResolver\b/.test(f.content));
    expect(implementers.map((f) => f.path)).toEqual(["src/platform/timekeeping/test-doubles/current-person-resolver.ts"]);
  });
});
