import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { scanImportBoundaries, type SourceFile } from "@/platform/architecture/import-boundaries";

const REPO_ROOT = join(__dirname, "..", "..", "..");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) return entry.name === "node_modules" || entry.name === ".next" ? [] : walk(full);
    if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) return [full];
    return [];
  });
}

function loadRepoSourceFiles(): SourceFile[] {
  return walk(join(REPO_ROOT, "src")).map((absolute) => ({
    path: relative(REPO_ROOT, absolute).split("\\").join("/"),
    content: readFileSync(absolute, "utf8"),
  }));
}

describe("import boundary fitness rules (fixtures prove each rule actually catches a violation)", () => {
  it("flags a client component importing the Prisma client", () => {
    const file: SourceFile = { path: "src/components/people/bad-client.tsx", content: `"use client";\nimport { getPrismaClient } from "@/platform/persistence/prisma-client";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "client-components-must-not-import-write-runtime", matchedImport: "@/platform/persistence/prisma-client" });
  });

  it("flags a client component importing a Unit of Work", () => {
    const file: SourceFile = { path: "src/components/people/bad-uow.tsx", content: `"use client";\nimport type { UnitOfWork } from "@/platform/people/persistence/prisma-employee-unit-of-work";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(1);
  });

  it("flags a server action importing the outbox worker directly", () => {
    const file: SourceFile = { path: "src/app/(app)/people/hire/bad-actions.ts", content: `"use server";\nimport { runOutboxWorker } from "@/platform/outbox/outbox-worker";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "server-actions-must-go-through-trusted-submission-gateway", matchedImport: "@/platform/outbox/outbox-worker" });
  });

  it("flags the read runtime importing the command/write runtime", () => {
    const file: SourceFile = { path: "src/platform/people/read-models/bad-read-repo.ts", content: `import { createCreateEmployeeCommand } from "@/platform/people/commands/create-employee-command";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "read-runtime-must-not-import-write-runtime", matchedImport: "@/platform/people/commands/create-employee-command" });
  });

  it("flags a React component importing Prisma types", () => {
    const file: SourceFile = { path: "src/components/people/bad-types.tsx", content: `import type { Employee } from "@prisma/client";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(1);
  });

  it("flags platform code importing Next.js UI internals", () => {
    const file: SourceFile = { path: "src/platform/people/bad-ui-import.ts", content: `import { RuntimeDirectoryPage } from "@/components/people/directory/runtime-directory-page";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "platform-must-not-import-nextjs-ui", matchedImport: "@/components/people/directory/runtime-directory-page" });
  });

  it("flags domain command code importing Prisma directly", () => {
    const file: SourceFile = { path: "src/platform/people/commands/bad-command.ts", content: `import type { Prisma } from "@prisma/client";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(1);
  });

  it("does not flag the legitimate read runtime loading organization references", () => {
    const file: SourceFile = { path: "src/platform/people/read-models/prisma-people-read-repositories.ts", content: `import type { Prisma, PrismaClient } from "@prisma/client";\nimport { requirePeoplePermission } from "@/platform/people/application/people-policies";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(0);
  });

  it("does not flag next/headers from platform observability code", () => {
    const file: SourceFile = { path: "src/platform/observability/request-context.ts", content: `import { headers } from "next/headers";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(0);
  });
});

describe("import boundary fitness rules — real codebase scan", () => {
  it("finds zero forbidden imports across the current source tree", () => {
    const violations = scanImportBoundaries(loadRepoSourceFiles());
    expect(violations).toEqual([]);
  });
});
