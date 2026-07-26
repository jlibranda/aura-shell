import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guards for Slice 4: ScheduleAssignment stays a pure
 * effective-dated binding with no employee/attendance-calculation reference,
 * no AttendanceDay/policy/payroll logic, no Organization write-side or
 * People domain-layer import, no hard-delete, and no historical-correction
 * path (Slice 4 Decisions 1, 4, 8, 9).
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

describe("ScheduleAssignment stays a pure binding — no attendance/payroll/policy reference", () => {
  const files = sourceFiles();
  const scheduleAssignmentFiles = files.filter((f) => f.path.startsWith("src/platform/timekeeping/") && /schedule-assignment|organization-assignment-port/.test(f.path));

  it("declares the ScheduleAssignmentRecord type in exactly one file", () => {
    const declarers = files.filter((f) => /interface\s+ScheduleAssignmentRecord\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/timekeeping/schedule-assignment.ts"]);
  });

  it("gives ScheduleAssignmentRecord no legalEntityId/orgUnitId/locationId/timezone field (never snapshots placement, ADR-014 §5.4)", () => {
    const domainFile = files.find((f) => f.path === "src/platform/timekeeping/schedule-assignment.ts");
    expect(domainFile).toBeDefined();
    const recordMatch = domainFile!.content.match(/export interface ScheduleAssignmentRecord \{[\s\S]*?\n\}/);
    expect(recordMatch).not.toBeNull();
    for (const forbidden of ["legalEntityId", "orgUnitId", "locationId", "timezone", "updatedAt", "replacedByAssignmentId"]) {
      expect(recordMatch![0]).not.toMatch(new RegExp(forbidden));
    }
  });

  it("never imports AttendanceDay, AttendanceEvent, or a Payroll module anywhere in the ScheduleAssignment file set", () => {
    for (const file of scheduleAssignmentFiles) {
      const importLines = file.content.split("\n").filter((line) => /^\s*import\b/.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/attendance-day/i);
        expect(line).not.toMatch(/attendance-event(?!-events)/);
        expect(line).not.toMatch(/payroll/i);
      }
    }
  });

  it("never performs a policy/payable/overtime/lateness calculation anywhere in the ScheduleAssignment file set", () => {
    for (const file of scheduleAssignmentFiles) {
      for (const forbidden of ["payableHours", "overtimeResult", "latenessResult", "policyResult", "attendancePolicy"]) {
        expect(file.content.toLowerCase()).not.toMatch(new RegExp(forbidden.toLowerCase()));
      }
    }
  });

  it("never imports People (Timekeeping's existing one-way dependency direction)", () => {
    for (const file of scheduleAssignmentFiles) {
      expect(file.content).not.toMatch(/platform\/people\//);
    }
  });

  it("never imports Organization code directly — the only cross-context reference is the local, transaction-scoped OrganizationAssignmentAsOfPort reading Prisma's assignment table (Slice 4 Decision 9)", () => {
    for (const file of scheduleAssignmentFiles) {
      const importLines = file.content.split("\n").filter((line) => /^\s*import\b/.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/platform\/organization\//);
      }
    }
  });

  it("never mutates WorkSchedule — the workSchedules port is used only for findVersionById", () => {
    for (const file of scheduleAssignmentFiles) {
      for (const forbidden of ["workSchedules.create(", "workSchedules.updateDetails(", "workSchedules.createVersion(", "workSchedules.activateVersion(", "workSchedules.replaceDraftVersionContent("]) {
        expect(file.content).not.toContain(forbidden);
      }
    }
  });

  it("declares no UI, route, or API file", () => {
    const uiOrApiFiles = files.filter((f) =>
      /schedule-assignment/i.test(f.path) &&
      (f.path.startsWith("src/app/") || f.path.startsWith("src/components/")),
    );
    expect(uiOrApiFiles).toEqual([]);
  });
});

describe("ScheduleAssignment write repository exposes no delete or historical-correction path", () => {
  const files = sourceFiles();
  const repoFile = files.find((f) => f.path === "src/platform/timekeeping/schedule-assignment-repository.ts");

  it("declares the ScheduleAssignmentWriteRepository interface in exactly one file", () => {
    const declarers = files.filter((f) => /interface\s+ScheduleAssignmentWriteRepository\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/timekeeping/schedule-assignment-repository.ts"]);
  });

  it("has no delete method and no generic update method for workScheduleVersionId/effectiveFrom", () => {
    expect(repoFile).toBeDefined();
    const match = repoFile!.content.match(/export interface ScheduleAssignmentWriteRepository \{[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const block = match![0];
    for (const forbidden of ["delete", "updateVersion", "correctAssignment", "changeVersion"]) {
      expect(block).not.toMatch(new RegExp(`\\b${forbidden}\\w*\\s*\\(`, "i"));
    }
  });
});

describe("ScheduleAssignmentService rejects the explicitly forbidden operations by never exposing them", () => {
  const files = sourceFiles();
  const serviceFile = files.find((f) => f.path === "src/platform/timekeeping/schedule-assignment-service.ts");

  it("has no updateWorkScheduleVersionOnAssignment/deleteAssignment/correctHistoricalAssignment/approveAssignment method (Slice 4 Decision 8)", () => {
    expect(serviceFile).toBeDefined();
    for (const forbidden of ["updateWorkScheduleVersionOnAssignment", "deleteAssignment", "correctHistoricalAssignment", "approveAssignment", "migrateVersion"]) {
      expect(serviceFile!.content).not.toMatch(new RegExp(`\\b${forbidden}\\s*\\(`));
    }
  });

  it("never sets effectiveUntil earlier than 'now' as the mechanism for cancelling a future assignment (uses the explicit cancellation fields instead, Slice 4 Decision 7)", () => {
    expect(serviceFile).toBeDefined();
    const methodMatch = serviceFile!.content.match(/async cancelFutureAssignment\([\s\S]*?\n {2}\}/);
    expect(methodMatch).not.toBeNull();
    expect(methodMatch![0]).not.toMatch(/\.end\(/);
    expect(methodMatch![0]).toMatch(/\.cancelFuture\(/);
  });
});
