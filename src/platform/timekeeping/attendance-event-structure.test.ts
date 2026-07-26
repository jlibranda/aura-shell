import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guards (ADR-014 §4.3, §14; Slice 1 Core Invariant #1):
 * AttendanceEvent is create-only. There must be no update, delete, archive,
 * restore, edit, or in-place correction operation anywhere in its write
 * surface, and Organization/People must never import Timekeeping.
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

describe("AttendanceEvent is create-only — no mutation surface anywhere", () => {
  const files = sourceFiles();
  const timekeepingFiles = files.filter((f) => f.path.startsWith("src/platform/timekeeping/"));

  it("declares the AttendanceEventWriteRepository interface in exactly one file", () => {
    const declarers = files.filter((f) => /(export\s+)?interface\s+AttendanceEventWriteRepository\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/timekeeping/attendance-event-repository.ts"]);
  });

  it("gives AttendanceEventWriteRepository no update/delete/archive/restore/end/edit/correct/supersede method", () => {
    const repoFile = files.find((f) => f.path === "src/platform/timekeeping/attendance-event-repository.ts");
    expect(repoFile).toBeDefined();
    const match = repoFile!.content.match(/export interface AttendanceEventWriteRepository \{[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const block = match![0];
    for (const name of FORBIDDEN_METHOD_NAMES) {
      const methodPattern = new RegExp(`\\b${name}\\w*\\s*\\(`, "i");
      expect(block).not.toMatch(methodPattern);
    }
  });

  it("gives AttendanceEventReadRepository no update/delete/archive/restore/end/edit/correct/supersede method", () => {
    const repoFile = files.find((f) => f.path === "src/platform/timekeeping/attendance-event-repository.ts");
    expect(repoFile).toBeDefined();
    const match = repoFile!.content.match(/export interface AttendanceEventReadRepository \{[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const block = match![0];
    for (const name of FORBIDDEN_METHOD_NAMES) {
      const methodPattern = new RegExp(`\\b${name}\\w*\\s*\\(`, "i");
      expect(block).not.toMatch(methodPattern);
    }
  });

  it("gives no Timekeeping source file any AttendanceEvent update/delete/archive/restore/edit/correct/supersede method", () => {
    const offenders = timekeepingFiles.filter((f) =>
      /AttendanceEvent/.test(f.content) &&
      /\b(updateAttendanceEvent|deleteAttendanceEvent|archiveAttendanceEvent|restoreAttendanceEvent|editAttendanceEvent|correctAttendanceEvent|supersedeAttendanceEvent)\s*\(/.test(f.content),
    );
    expect(offenders.map((f) => f.path)).toEqual([]);
  });

  it("gives the AttendanceEventRecord domain type no updatedAt, deletedAt, or correction/supersession pointer field", () => {
    const domainFile = files.find((f) => f.path === "src/platform/timekeeping/attendance-event.ts");
    expect(domainFile).toBeDefined();
    const match = domainFile!.content.match(/export interface AttendanceEventRecord \{[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const block = match![0];
    for (const forbidden of ["updatedAt", "deletedAt", "correctedBy", "supersededBy", "supersedes", "correctionOf"]) {
      expect(block).not.toMatch(new RegExp(forbidden));
    }
  });

  it("keeps all AttendanceEvent domain code within the timekeeping domain", () => {
    const foreign = files.filter((f) => /interface\s+AttendanceEventRecord\b/.test(f.content) && !f.path.startsWith("src/platform/timekeeping/"));
    expect(foreign).toEqual([]);
  });
});
