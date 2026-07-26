import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Structural guards for Slice 5 Phase A: AttendancePolicy stays the stable,
 * flat contract Slice 6 depends on — no AttendanceDay/attendance-calculation
 * reference, no People/Organization/Payroll import, no monetary field, no
 * workdayBoundaryMinutes anywhere (a fixed Algorithm Invariant per ADR-014
 * Appendix G, never a policy field), no lifecycle operation beyond
 * create/replace/end, a resolver interface not coupled to its one
 * implementation, and — critically — no nested "rule object" substitution
 * for the approved flat ResolvedAttendancePolicy contract.
 */
const REPO_ROOT = join(__dirname, "..", "..", "..");

const APPROVED_RESOLVED_ATTENDANCE_POLICY_FIELDS = [
  "policyId",
  "policyVersionId",
  "scope",
  "scopeId",
  "tenantId",
  "effectiveFrom",
  "effectiveUntil",
  "roundingIntervalMinutes",
  "roundingDirection",
  "gracePeriodMinutes",
  "latenessToleranceMinutes",
  "unpaidBreakMinutes",
  "standardWorkWeekMinutes",
  "isStandardWorkWeekStatutoryFloor",
  "dailyOvertimeThresholdMinutes",
  "calculationAlgorithmVersion",
  "fingerprint",
] as const;

/** Prohibited nested/renamed replacement structures for the approved flat contract (Slice 5 contract-conformance audit). */
const PROHIBITED_NESTED_SUBSTITUTIONS = [
  "rounding",
  "gracePeriod",
  "breakRules",
  "overtime",
  "tolerance",
  "overtimeThresholdsAreStatutoryFloor",
  "policyRules",
  "attendanceRules",
  "attendancePolicyId",
  "attendancePolicyVersionId",
] as const;

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

describe("ResolvedAttendancePolicy is the exact approved flat contract — no nested/renamed substitution", () => {
  const files = sourceFiles();
  const domainFile = files.find((f) => f.path === "src/platform/timekeeping/attendance-policy.ts");

  it("declares ResolvedAttendancePolicy in exactly one file", () => {
    const declarers = files.filter((f) => /interface\s+ResolvedAttendancePolicy\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/timekeeping/attendance-policy.ts"]);
  });

  it("declares exactly the approved flat field set on ResolvedAttendancePolicy — no more, no fewer", () => {
    expect(domainFile).toBeDefined();
    const match = domainFile!.content.match(/export interface ResolvedAttendancePolicy \{[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const block = match![0];
    const fieldNames = [...block.matchAll(/^\s{2}([a-zA-Z][a-zA-Z0-9]*)\??:/gm)].map((m) => m[1]);
    expect(fieldNames.sort()).toEqual([...APPROVED_RESOLVED_ATTENDANCE_POLICY_FIELDS].sort());
  });

  it("never substitutes a nested rule object for the approved flat contract anywhere in the AttendancePolicy file set", () => {
    const attendancePolicyFiles = files.filter((f) => f.path.startsWith("src/platform/timekeeping/") && /attendance-policy/.test(f.path));
    for (const file of attendancePolicyFiles) {
      for (const forbidden of PROHIBITED_NESTED_SUBSTITUTIONS) {
        expect(file.content).not.toMatch(new RegExp(`\\b${forbidden}\\s*:`));
        expect(file.content).not.toMatch(new RegExp(`\\.${forbidden}\\b`));
      }
    }
  });

  it("uses lowercase RoundingDirection values ('nearest' | 'up' | 'down'), never the uppercase form", () => {
    expect(domainFile).toBeDefined();
    expect(domainFile!.content).toMatch(/ROUNDING_DIRECTIONS\s*=\s*\["nearest",\s*"up",\s*"down"\]/);
    expect(domainFile!.content).not.toMatch(/"NEAREST"|"UP"|"DOWN"/);
  });

  it("never imposes a divisibility-by-60 (or any other) restriction on roundingIntervalMinutes beyond > 0 — that rule was never authorized (prose explaining the deliberate absence is fine; only executable code is checked)", () => {
    const attendancePolicyFiles = files.filter((f) => f.path.startsWith("src/platform/timekeeping/") && /attendance-policy/.test(f.path));
    for (const file of attendancePolicyFiles) {
      const codeOnly = file.content.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
      expect(codeOnly).not.toMatch(/60\s*%/);
    }
  });
});

describe("AttendancePolicy stays the stable Slice 6 contract — no calculation/payroll reference", () => {
  const files = sourceFiles();
  const attendancePolicyFiles = files.filter((f) => f.path.startsWith("src/platform/timekeeping/") && /attendance-policy/.test(f.path));

  it("never references workdayBoundaryMinutes as a field anywhere in the AttendancePolicy file set — it is a fixed Algorithm Invariant, never a policy field", () => {
    for (const file of attendancePolicyFiles) {
      expect(file.content).not.toMatch(/[.\s]workdayBoundaryMinutes\s*[?:]/i);
    }
  });

  it("never imports AttendanceDay, AttendanceEvent (calculation, not ingestion), or a Payroll module anywhere in the AttendancePolicy file set", () => {
    for (const file of attendancePolicyFiles) {
      const importLines = file.content.split("\n").filter((line) => /^\s*import\b/.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/attendance-day/i);
        expect(line).not.toMatch(/attendance-event/i);
        expect(line).not.toMatch(/payroll/i);
      }
    }
  });

  it("never imports People or Organization code directly — the Tenant-only baseline resolver needs neither", () => {
    for (const file of attendancePolicyFiles) {
      const importLines = file.content.split("\n").filter((line) => /^\s*import\b/.test(line));
      for (const line of importLines) {
        expect(line).not.toMatch(/platform\/people\//);
        expect(line).not.toMatch(/platform\/organization\//);
      }
    }
  });

  it("never contains a monetary, currency, or payable field", () => {
    for (const file of attendancePolicyFiles) {
      for (const forbidden of ["currency", "payRate", "hourlyRate", "payableAmount", "wage"]) {
        expect(file.content.toLowerCase()).not.toMatch(new RegExp(forbidden.toLowerCase()));
      }
    }
  });

  it("declares no UI, route, or API file", () => {
    const uiOrApiFiles = files.filter((f) =>
      /attendance-policy/i.test(f.path) &&
      (f.path.startsWith("src/app/") || f.path.startsWith("src/components/")),
    );
    expect(uiOrApiFiles).toEqual([]);
  });
});

describe("AttendancePolicyResolver is decoupled from its one implementation", () => {
  const files = sourceFiles();
  const resolverPortFile = files.find((f) => f.path === "src/platform/timekeeping/attendance-policy-resolver.ts");

  it("attendance-policy-resolver.ts never imports or type-references BaselineAttendancePolicyResolver (a doc-comment mention explaining that it's one conformant implementation is fine — an import or `implements`/type coupling is not)", () => {
    expect(resolverPortFile).toBeDefined();
    const codeOnly = resolverPortFile!.content.replace(/\/\*\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(codeOnly).not.toMatch(/BaselineAttendancePolicyResolver/);
  });

  it("BaselineAttendancePolicyResolver implements the port interface, not a second, divergent contract", () => {
    const implFile = files.find((f) => f.path === "src/platform/timekeeping/baseline-attendance-policy-resolver.ts");
    expect(implFile).toBeDefined();
    expect(implFile!.content).toMatch(/implements AttendancePolicyResolver/);
  });

  it("BaselineAttendancePolicyResolver never imports Organization code — it never independently queries placement state", () => {
    const implFile = files.find((f) => f.path === "src/platform/timekeeping/baseline-attendance-policy-resolver.ts");
    expect(implFile).toBeDefined();
    const importLines = implFile!.content.split("\n").filter((line) => /^\s*import\b/.test(line));
    for (const line of importLines) expect(line).not.toMatch(/platform\/organization\//);
  });
});

describe("AttendancePolicy write repository exposes no delete or in-place value mutation", () => {
  const files = sourceFiles();
  const repoFile = files.find((f) => f.path === "src/platform/timekeeping/attendance-policy-repository.ts");

  it("declares the AttendancePolicyWriteRepository interface in exactly one file", () => {
    const declarers = files.filter((f) => /interface\s+AttendancePolicyWriteRepository\b/.test(f.content));
    expect(declarers.map((f) => f.path)).toEqual(["src/platform/timekeeping/attendance-policy-repository.ts"]);
  });

  it("has no delete method and no in-place update method for policy values", () => {
    expect(repoFile).toBeDefined();
    const match = repoFile!.content.match(/export interface AttendancePolicyWriteRepository \{[\s\S]*?\n\}/);
    expect(match).not.toBeNull();
    const block = match![0];
    for (const forbidden of ["delete", "updateValues", "correctPolicy", "changeValues"]) {
      expect(block).not.toMatch(new RegExp(`\\b${forbidden}\\w*\\s*\\(`, "i"));
    }
  });
});

describe("AttendancePolicyService exposes only create/replace/end (no cancelFutureTenantPolicy)", () => {
  const files = sourceFiles();
  const serviceFile = files.find((f) => f.path === "src/platform/timekeeping/attendance-policy-service.ts");

  it("has exactly the three approved lifecycle methods and no cancelFutureTenantPolicy or deletePolicy", () => {
    expect(serviceFile).toBeDefined();
    expect(serviceFile!.content).toMatch(/async createTenantPolicy\(/);
    expect(serviceFile!.content).toMatch(/async replaceTenantPolicy\(/);
    expect(serviceFile!.content).toMatch(/async endTenantPolicy\(/);
    for (const forbidden of ["cancelFutureTenantPolicy", "deletePolicy", "deleteTenantPolicy", "approvePolicy"]) {
      expect(serviceFile!.content).not.toMatch(new RegExp(`\\b${forbidden}\\s*\\(`));
    }
  });

  it("every mutating method requires timekeeping.manage via requireManage", () => {
    expect(serviceFile).toBeDefined();
    const occurrences = serviceFile!.content.match(/this\.requireManage\(request\)/g) ?? [];
    expect(occurrences.length).toBeGreaterThanOrEqual(3);
  });
});

describe("attendance_policies migration installs the required database-level invariants", () => {
  const migrationsRoot = join(REPO_ROOT, "prisma", "migrations");
  const migrationDirs = readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /timekeeping_attendance_policy/.test(entry.name));

  it("has exactly one migration for this slice", () => {
    expect(migrationDirs).toHaveLength(1);
  });

  it("installs a GIST exclusion constraint for non-overlap and never a unique constraint on fingerprint alone", () => {
    expect(migrationDirs).toHaveLength(1);
    const sql = readFileSync(join(migrationsRoot, migrationDirs[0].name, "migration.sql"), "utf8");
    expect(sql).toMatch(/EXCLUDE USING gist/);
    expect(sql).not.toMatch(/UNIQUE INDEX[^;]*\("fingerprint"\)/i);
  });

  it("enforces rounding_interval_minutes > 0 without an unauthorized divides-60 constraint", () => {
    expect(migrationDirs).toHaveLength(1);
    const sql = readFileSync(join(migrationsRoot, migrationDirs[0].name, "migration.sql"), "utf8");
    expect(sql).toMatch(/"rounding_interval_minutes"\s*>\s*0/);
    expect(sql).not.toMatch(/60\s*%/);
  });

  it("constrains rounding_direction to the lowercase approved values only", () => {
    expect(migrationDirs).toHaveLength(1);
    const sql = readFileSync(join(migrationsRoot, migrationDirs[0].name, "migration.sql"), "utf8");
    expect(sql).toMatch(/'nearest',\s*'up',\s*'down'/);
    expect(sql).not.toMatch(/'NEAREST'|'UP'|'DOWN'/);
  });
});
