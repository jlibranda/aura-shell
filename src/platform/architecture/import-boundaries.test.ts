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

  it("flags a client component importing password hashing (an authentication secret module)", () => {
    const file: SourceFile = { path: "src/components/auth/bad-login-form.tsx", content: `"use client";\nimport { hashPassword } from "@/platform/auth/password";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "client-components-must-not-import-auth-secrets", matchedImport: "@/platform/auth/password" });
  });

  it("flags a client component importing centralized environment validation (secrets)", () => {
    const file: SourceFile = { path: "src/components/auth/bad-env-reader.tsx", content: `"use client";\nimport { validateEnvironment } from "@/platform/env";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(1);
  });

  it("flags a client component constructing a trusted request context", () => {
    const file: SourceFile = { path: "src/components/people/bad-context-builder.tsx", content: `"use client";\nimport { createTrustedRequestContext } from "@/platform/runtime-context";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "client-components-must-not-construct-trusted-context", matchedImport: "@/platform/runtime-context" });
  });

  it("flags a client component importing the development session adapter (a source of tenant/roles/permissions)", () => {
    const file: SourceFile = { path: "src/components/people/bad-dev-session.tsx", content: `"use client";\nimport { getDevelopmentSession } from "@/platform/development-session";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(1);
  });

  it("flags a client component importing platform/context (PermissionSet/TenantContext construction)", () => {
    const file: SourceFile = { path: "src/components/people/bad-permission-set.tsx", content: `"use client";\nimport { PermissionSet } from "@/platform/context";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(1);
  });

  it("flags a server action resolving identity outside resolveRequestContext()", () => {
    const file: SourceFile = { path: "src/app/(app)/people/hire/bad-actions.ts", content: `"use server";\nimport { getDevelopmentRequestContext } from "@/platform/development-session";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "server-actions-must-go-through-trusted-submission-gateway", matchedImport: "@/platform/development-session" });
  });

  it("flags the development session adapter importing production authentication machinery", () => {
    const file: SourceFile = { path: "src/platform/development-session.ts", content: `import { createProductionAuthRuntime } from "@/platform/auth/production-auth-runtime";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "development-session-must-not-import-production-auth", matchedImport: "@/platform/auth/production-auth-runtime" });
  });

  it("flags authentication code importing People UI components", () => {
    const file: SourceFile = { path: "src/platform/auth/bad-login-service.ts", content: `import { RuntimeDirectoryPage } from "@/components/people/directory/runtime-directory-page";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "auth-code-must-not-import-people-ui", matchedImport: "@/components/people/directory/runtime-directory-page" });
  });

  it("flags domain command code importing NextAuth or Next.js session APIs", () => {
    const nextAuthFile: SourceFile = { path: "src/platform/people/commands/bad-nextauth.ts", content: `import { getServerSession } from "next-auth";\n` };
    const headersFile: SourceFile = { path: "src/platform/people/commands/bad-headers.ts", content: `import { headers } from "next/headers";\n` };
    expect(scanImportBoundaries([nextAuthFile])).toHaveLength(1);
    expect(scanImportBoundaries([headersFile])).toHaveLength(1);
  });

  it("does not flag resolve-request-context.ts's own legitimate use of next/navigation redirect()", () => {
    const file: SourceFile = { path: "src/platform/auth/resolve-request-context.ts", content: `import { redirect } from "next/navigation";\nimport { getDevelopmentRequestContext } from "@/platform/development-session";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(0);
  });

  it("does not flag the legitimate read runtime loading organization references", () => {
    const file: SourceFile = { path: "src/platform/people/read-models/prisma-people-read-repositories.ts", content: `import type { Prisma, PrismaClient } from "@prisma/client";\nimport { requirePeoplePermission } from "@/platform/people/application/people-policies";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(0);
  });

  it("does not flag next/headers from platform observability code", () => {
    const file: SourceFile = { path: "src/platform/observability/request-context.ts", content: `import { headers } from "next/headers";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(0);
  });

  it("flags a client component importing the configuration Unit of Work", () => {
    const file: SourceFile = { path: "src/components/settings/bad-client.tsx", content: `"use client";\nimport { PrismaConfigurationUnitOfWork } from "@/platform/configuration/prisma-configuration-unit-of-work";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "client-components-must-not-import-write-runtime", matchedImport: "@/platform/configuration/prisma-configuration-unit-of-work" });
  });

  it("flags a client component importing the durable configuration runtime (bypasses settings.* authorization)", () => {
    const file: SourceFile = { path: "src/components/settings/bad-runtime.tsx", content: `"use client";\nimport { createDurableConfigurationRuntime } from "@/platform/configuration/durable-configuration-runtime";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "client-components-must-not-import-configuration-server-composition", matchedImport: "@/platform/configuration/durable-configuration-runtime" });
  });

  it("flags a client component importing the configuration settings loader directly", () => {
    const file: SourceFile = { path: "src/components/settings/bad-loader.tsx", content: `"use client";\nimport { loadGeneralSettingsView } from "@/platform/configuration/general-settings-loader";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(1);
  });

  it("flags configuration command code importing Prisma directly", () => {
    const file: SourceFile = { path: "src/platform/configuration/commands/bad-command.ts", content: `import type { Prisma } from "@prisma/client";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(1);
  });

  it("flags configuration command code importing Next.js session APIs", () => {
    const file: SourceFile = { path: "src/platform/configuration/commands/bad-headers.ts", content: `import { headers } from "next/headers";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(1);
  });

  it("does not flag the legitimate configuration read repository using Prisma server-side", () => {
    const file: SourceFile = { path: "src/platform/configuration/prisma-configuration-read-repository.ts", content: `import type { Prisma, PrismaClient } from "@prisma/client";\nimport { hasPermission } from "@/platform/context";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(0);
  });

  it("does not flag the legitimate server action composing the durable configuration runtime", () => {
    const file: SourceFile = { path: "src/app/(app)/settings/general/actions.ts", content: `"use server";\nimport { createDurableConfigurationRuntime } from "@/platform/configuration/durable-configuration-runtime";\nimport { resolveRequestContext } from "@/platform/auth/resolve-request-context";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(0);
  });

  it("flags a client component importing the configuration registry service (ADR-011 server composition)", () => {
    const file: SourceFile = { path: "src/components/settings/bad-registry-client.tsx", content: `"use client";\nimport { describeConfigurationCategories } from "@/platform/configuration/registry/configuration-registry-service";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "client-components-must-not-import-configuration-server-composition", matchedImport: "@/platform/configuration/registry/configuration-registry-service" });
  });

  it("flags the registry importing the configuration write side (registry must stay read-only)", () => {
    const uow: SourceFile = { path: "src/platform/configuration/registry/bad-registry.ts", content: `import { PrismaConfigurationUnitOfWork } from "@/platform/configuration/prisma-configuration-unit-of-work";\n` };
    const command: SourceFile = { path: "src/platform/configuration/registry/bad-registry-2.ts", content: `import { SaveGeneralSettingsDraftHandler } from "@/platform/configuration/commands/general-settings-durable-handlers";\n` };
    expect(scanImportBoundaries([uow])).toContainEqual({ path: uow.path, rule: "configuration-registry-must-not-import-write-side", matchedImport: "@/platform/configuration/prisma-configuration-unit-of-work" });
    expect(scanImportBoundaries([command])).toContainEqual({ path: command.path, rule: "configuration-registry-must-not-import-write-side", matchedImport: "@/platform/configuration/commands/general-settings-durable-handlers" });
  });

  it("flags the static manifest importing persistence (manifest must be pure data)", () => {
    const prismaImport: SourceFile = { path: "src/platform/configuration/registry/configuration-manifest.ts", content: `import type { PrismaClient } from "@prisma/client";\n` };
    const readerImport: SourceFile = { path: "src/platform/configuration/registry/configuration-manifest.ts", content: `import type { ConfigurationReadRepository } from "@/platform/configuration/configuration-repository";\n` };
    expect(scanImportBoundaries([prismaImport])).toContainEqual({ path: prismaImport.path, rule: "configuration-manifest-must-not-import-persistence", matchedImport: "@prisma/client" });
    expect(scanImportBoundaries([readerImport])).toContainEqual({ path: readerImport.path, rule: "configuration-manifest-must-not-import-persistence", matchedImport: "@/platform/configuration/configuration-repository" });
  });

  it("does not flag the legitimate registry service reading through the read-repository port and permissions", () => {
    const file: SourceFile = { path: "src/platform/configuration/registry/configuration-registry-service.ts", content: `import { hasPermission } from "@/platform/context";\nimport type { ConfigurationReadRepository } from "@/platform/configuration/configuration-repository";\nimport { CONFIGURATION_MANIFEST } from "@/platform/configuration/registry/configuration-manifest";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(0);
  });

  it("flags the organization read repository importing the org write side (read model must stay read-only)", () => {
    const file: SourceFile = { path: "src/platform/organization/prisma-org-unit-read-repository.ts", content: `import { OrgUnitService } from "@/platform/organization/org-unit-service";\n` };
    expect(scanImportBoundaries([file])).toContainEqual({ path: file.path, rule: "organization-read-repository-must-not-import-write-side", matchedImport: "@/platform/organization/org-unit-service" });
  });

  it("flags a client component importing the org unit service (ADR-012 server composition)", () => {
    const file: SourceFile = { path: "src/components/organization/bad-client.tsx", content: `"use client";\nimport { OrgUnitService } from "@/platform/organization/org-unit-service";\n` };
    expect(scanImportBoundaries([file])).toContainEqual({ path: file.path, rule: "client-components-must-not-import-organization-server-composition", matchedImport: "@/platform/organization/org-unit-service" });
  });

  it("flags the assignment read repository importing the assignment write side (read model must stay read-only)", () => {
    const file: SourceFile = { path: "src/platform/organization/prisma-assignment-read-repository.ts", content: `import { AssignmentService } from "@/platform/organization/assignment-service";\n` };
    expect(scanImportBoundaries([file])).toContainEqual({ path: file.path, rule: "organization-read-repository-must-not-import-write-side", matchedImport: "@/platform/organization/assignment-service" });
  });

  it("flags a client component importing the assignment service (ADR-012 server composition)", () => {
    const file: SourceFile = { path: "src/components/organization/bad-assignment-client.tsx", content: `"use client";\nimport { AssignmentService } from "@/platform/organization/assignment-service";\n` };
    expect(scanImportBoundaries([file])).toContainEqual({ path: file.path, rule: "client-components-must-not-import-organization-server-composition", matchedImport: "@/platform/organization/assignment-service" });
  });

  it("does not flag the legitimate assignment read repository reading through Prisma with a permission gate", () => {
    const file: SourceFile = { path: "src/platform/organization/prisma-assignment-read-repository.ts", content: `import type { PrismaClient } from "@prisma/client";\nimport { hasPermission } from "@/platform/context";\nimport type { AssignmentReadRepository } from "@/platform/organization/assignment-repository";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(0);
  });

  it("flags Configuration importing Organization, and Organization importing Configuration (peer domains must not couple)", () => {
    const configToOrg: SourceFile = { path: "src/platform/configuration/bad.ts", content: `import { buildOrgUnitTree } from "@/platform/organization/org-unit";\n` };
    const orgToConfig: SourceFile = { path: "src/platform/organization/bad.ts", content: `import { CONFIGURATION_MANIFEST } from "@/platform/configuration/registry/configuration-manifest";\n` };
    expect(scanImportBoundaries([configToOrg])).toContainEqual({ path: configToOrg.path, rule: "configuration-must-not-import-organization", matchedImport: "@/platform/organization/org-unit" });
    expect(scanImportBoundaries([orgToConfig])).toContainEqual({ path: orgToConfig.path, rule: "organization-must-not-import-configuration", matchedImport: "@/platform/configuration/registry/configuration-manifest" });
  });

  it("does not flag the legitimate org read repository reading through Prisma with a permission gate", () => {
    const file: SourceFile = { path: "src/platform/organization/prisma-org-unit-read-repository.ts", content: `import type { PrismaClient } from "@prisma/client";\nimport { hasPermission } from "@/platform/context";\nimport type { OrgUnitReadRepository } from "@/platform/organization/org-unit-repository";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(0);
  });

  it("flags the location read repository importing the location write side (read model must stay read-only)", () => {
    const file: SourceFile = { path: "src/platform/organization/prisma-location-read-repository.ts", content: `import { LocationService } from "@/platform/organization/location-service";\n` };
    expect(scanImportBoundaries([file])).toContainEqual({ path: file.path, rule: "organization-read-repository-must-not-import-write-side", matchedImport: "@/platform/organization/location-service" });
  });

  it("flags a client component importing the location service (ADR-012 server composition)", () => {
    const file: SourceFile = { path: "src/components/organization/bad-location-client.tsx", content: `"use client";\nimport { LocationService } from "@/platform/organization/location-service";\n` };
    expect(scanImportBoundaries([file])).toContainEqual({ path: file.path, rule: "client-components-must-not-import-organization-server-composition", matchedImport: "@/platform/organization/location-service" });
  });

  it("does not flag the legitimate location read repository reading through Prisma with a permission gate", () => {
    const file: SourceFile = { path: "src/platform/organization/prisma-location-read-repository.ts", content: `import type { PrismaClient } from "@prisma/client";\nimport { hasPermission } from "@/platform/context";\nimport type { LocationReadRepository } from "@/platform/organization/location-repository";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(0);
  });

  it("flags OrgUnit code importing Location (Location is orthogonal to the tree, never owned by OrgUnit)", () => {
    const file: SourceFile = { path: "src/platform/organization/org-unit-service.ts", content: `import type { LocationRecord } from "@/platform/organization/location";\n` };
    expect(scanImportBoundaries([file])).toContainEqual({ path: file.path, rule: "org-unit-must-not-import-location", matchedImport: "@/platform/organization/location" });
  });

  it("does not flag Location code importing OrgUnit-unrelated organization utilities (Location may stand alone)", () => {
    const file: SourceFile = { path: "src/platform/organization/location-service.ts", content: `import { hasPermission } from "@/platform/context";\nimport { validateCreateLocationDraft } from "@/platform/organization/location";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(0);
  });

  it("flags the organization query service importing Prisma directly (queries must go through the read repositories, never bypass Assignment)", () => {
    const file: SourceFile = { path: "src/platform/organization/organization-query-service.ts", content: `import type { PrismaClient } from "@prisma/client";\n` };
    expect(scanImportBoundaries([file])).toContainEqual({ path: file.path, rule: "organization-query-service-must-not-import-prisma-directly", matchedImport: "@prisma/client" });
  });

  it("flags the organization query service importing the write side (a read service must never mutate an aggregate)", () => {
    const file: SourceFile = { path: "src/platform/organization/organization-query-service.ts", content: `import { LocationService } from "@/platform/organization/location-service";\n` };
    expect(scanImportBoundaries([file])).toContainEqual({ path: file.path, rule: "organization-query-service-must-not-import-write-side", matchedImport: "@/platform/organization/location-service" });
  });

  it("flags a client component importing the organization query service or the People placement service (ADR-012 server composition)", () => {
    const queryFile: SourceFile = { path: "src/components/organization/bad-query-client.tsx", content: `"use client";\nimport { OrganizationQueryService } from "@/platform/organization/organization-query-service";\n` };
    const placementFile: SourceFile = { path: "src/components/people/bad-placement-client.tsx", content: `"use client";\nimport { PrismaOrganizationPlacementService } from "@/platform/people/read-models/prisma-organization-placement-service";\n` };
    expect(scanImportBoundaries([queryFile])).toContainEqual({ path: queryFile.path, rule: "client-components-must-not-import-organization-server-composition", matchedImport: "@/platform/organization/organization-query-service" });
    expect(scanImportBoundaries([placementFile])).toContainEqual({ path: placementFile.path, rule: "client-components-must-not-import-organization-server-composition", matchedImport: "@/platform/people/read-models/prisma-organization-placement-service" });
  });

  it("flags the People placement service implementation importing the Organization write side", () => {
    const file: SourceFile = { path: "src/platform/people/read-models/prisma-organization-placement-service.ts", content: `import { AssignmentService } from "@/platform/organization/assignment-service";\n` };
    expect(scanImportBoundaries([file])).toContainEqual({ path: file.path, rule: "organization-placement-service-must-not-import-write-side", matchedImport: "@/platform/organization/assignment-service" });
  });

  it("does not flag the legitimate organization query service composing the three read repositories", () => {
    const file: SourceFile = { path: "src/platform/organization/organization-query-service.ts", content: `import type { AssignmentReadRepository } from "@/platform/organization/assignment-repository";\nimport type { OrgUnitReadRepository } from "@/platform/organization/org-unit-repository";\nimport type { LocationReadRepository } from "@/platform/organization/location-repository";\n` };
    expect(scanImportBoundaries([file])).toHaveLength(0);
  });

  it("flags Organization code importing Timekeeping (ADR-014 §3 one-way dependency chain)", () => {
    const file: SourceFile = { path: "src/platform/organization/bad-organization-service.ts", content: `import type { AttendanceEventRecord } from "@/platform/timekeeping/attendance-event";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "organization-must-not-import-timekeeping", matchedImport: "@/platform/timekeeping/attendance-event" });
  });

  it("flags People code importing Timekeeping (ADR-014 §3 one-way dependency chain)", () => {
    const file: SourceFile = { path: "src/platform/people/bad-people-service.ts", content: `import type { AttendanceEventRecord } from "@/platform/timekeeping/attendance-event";\n` };
    const violations = scanImportBoundaries([file]);
    expect(violations).toContainEqual({ path: file.path, rule: "people-must-not-import-timekeeping", matchedImport: "@/platform/timekeeping/attendance-event" });
  });
});

describe("import boundary fitness rules — real codebase scan", () => {
  it("finds zero forbidden imports across the current source tree", () => {
    const violations = scanImportBoundaries(loadRepoSourceFiles());
    expect(violations).toEqual([]);
  });
});
