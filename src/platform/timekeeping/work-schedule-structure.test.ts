import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guards for Slice 3: WorkSchedule stays a versioned template
 * with no employee/person reference, no direct link to AttendanceEvent/
 * AttendanceDay/Payroll, no policy calculation, and no path that mutates
 * ACTIVE/RETIRED content or deletes a row (Slice 3 Decisions 1, 8, 9;
 * "Allowed Operations" section).
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

describe("WorkSchedule stays a pure template — no person/attendance/payroll/policy reference", () => {
  const files = sourceFiles();
  const workScheduleFiles = files.filter((f) => f.path.startsWith("src/platform/timekeeping/") && /work-schedule/.test(f.path));

  it("declares the WorkScheduleRecord and WorkScheduleVersionRecord types in exactly one file", () => {
    const declarers = files.filter((f) => /interface\s+WorkScheduleRecord\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/timekeeping/work-schedule.ts"]);
    const versionDeclarers = files.filter((f) => /interface\s+WorkScheduleVersionRecord\b/.test(f.content));
    expect(versionDeclarers.map((f) => f.path)).toEqual(["src/platform/timekeeping/work-schedule.ts"]);
  });

  it("gives WorkScheduleRecord and WorkScheduleVersionRecord no employeeId/personId/effectiveFrom/effectiveUntil field", () => {
    const domainFile = files.find((f) => f.path === "src/platform/timekeeping/work-schedule.ts");
    expect(domainFile).toBeDefined();
    const recordMatch = domainFile!.content.match(/export interface WorkScheduleRecord \{[\s\S]*?\n\}/);
    const versionMatch = domainFile!.content.match(/export interface WorkScheduleVersionRecord \{[\s\S]*?\n\}/);
    expect(recordMatch).not.toBeNull();
    expect(versionMatch).not.toBeNull();
    for (const forbidden of ["employeeId", "personId", "effectiveFrom", "effectiveUntil"]) {
      expect(recordMatch![0]).not.toMatch(new RegExp(forbidden));
      expect(versionMatch![0]).not.toMatch(new RegExp(forbidden));
    }
  });

  it("never imports AttendanceEvent, AttendanceDay, or a Payroll module anywhere in the WorkSchedule file set", () => {
    for (const file of workScheduleFiles) {
      const importLines = file.content.split("\n").filter((line) => /^\s*import\b/.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/attendance-event(?!-events)/);
        expect(line).not.toMatch(/attendance-day/i);
        expect(line).not.toMatch(/payroll/i);
      }
    }
  });

  it("never performs a policy/payable/overtime calculation anywhere in the WorkSchedule file set", () => {
    for (const file of workScheduleFiles) {
      for (const forbidden of ["payableHours", "overtimeResult", "latenessResult", "policyResult", "attendancePolicy"]) {
        expect(file.content.toLowerCase()).not.toMatch(new RegExp(forbidden.toLowerCase()));
      }
    }
  });

  it("never imports People (Timekeeping's existing one-way dependency direction)", () => {
    for (const file of workScheduleFiles) {
      expect(file.content).not.toMatch(/platform\/people\//);
    }
  });
});

describe("WorkSchedule write repository exposes no direct status mutation or delete path", () => {
  const files = sourceFiles();
  const repoFile = files.find((f) => f.path === "src/platform/timekeeping/work-schedule-repository.ts");

  it("declares the WorkScheduleWriteRepository interface in exactly one file", () => {
    const declarers = files.filter((f) => /interface\s+WorkScheduleWriteRepository\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/timekeeping/work-schedule-repository.ts"]);
  });

  it("has no delete method, no changeCode method, and no generic status-mutation method", () => {
    expect(repoFile).toBeDefined();
    const match = repoFile!.content.match(/export interface WorkScheduleWriteRepository \{[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const block = match![0];
    for (const forbidden of ["delete", "changeCode", "updateStatus", "setStatus", "updateActiveVersion", "updateRetiredVersion", "archive"]) {
      expect(block).not.toMatch(new RegExp(`\\b${forbidden}\\w*\\s*\\(`, "i"));
    }
  });

  it("exposes exactly one activation method, and it is the only path to ACTIVE/RETIRED status", () => {
    expect(repoFile).toBeDefined();
    const match = repoFile!.content.match(/export interface WorkScheduleWriteRepository \{[\s\S]*?\n\}/);
    const activateMatches = match![0].match(/\bactivate\w*\s*\(/gi) ?? [];
    expect(activateMatches).toHaveLength(1);
  });
});

describe("WorkScheduleService rejects the explicitly forbidden operations by never exposing them", () => {
  const files = sourceFiles();
  const serviceFile = files.find((f) => f.path === "src/platform/timekeeping/work-schedule-service.ts");

  it("has no changeWorkScheduleCode/updateActiveVersionContent/updateRetiredVersionContent/deleteWorkSchedule/deleteWorkScheduleVersion method", () => {
    expect(serviceFile).toBeDefined();
    for (const forbidden of ["changeWorkScheduleCode", "updateActiveVersionContent", "updateRetiredVersionContent", "deleteWorkSchedule", "deleteWorkScheduleVersion"]) {
      expect(serviceFile!.content).not.toMatch(new RegExp(`\\b${forbidden}\\s*\\(`));
    }
  });
});
