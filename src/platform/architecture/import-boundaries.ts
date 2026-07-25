export interface SourceFile {
  /** Repo-relative, forward-slash path, e.g. "src/components/people/foo.tsx". */
  path: string;
  content: string;
}

export interface BoundaryViolation {
  path: string;
  rule: string;
  matchedImport: string;
}

interface Rule {
  name: string;
  /** Which files this rule applies to. */
  appliesTo: (file: SourceFile) => boolean;
  /** Import specifiers forbidden for files this rule applies to. */
  forbidden: RegExp[];
}

const IMPORT_SPECIFIER = /(?:from\s+|require\()\s*["']([^"']+)["']/g;

function importsOf(content: string): string[] {
  return [...content.matchAll(IMPORT_SPECIFIER)].map((match) => match[1]);
}

function hasDirective(content: string, directive: "use client" | "use server"): boolean {
  return new RegExp(`^\\s*["']${directive}["'];?\\s*$`, "m").test(content.split("\n").slice(0, 3).join("\n"));
}

const isClientComponent = (file: SourceFile) => hasDirective(file.content, "use client");
const isServerAction = (file: SourceFile) => hasDirective(file.content, "use server");
const isReactComponent = (file: SourceFile) => file.path.startsWith("src/components/");
const isReadRuntime = (file: SourceFile) =>
  file.path.startsWith("src/platform/people/read-models/") ||
  /\/(directory|profile)-runtime-loader\.ts$/.test(file.path) ||
  file.path.endsWith("prisma-people-read-runtime.ts");
const isPlatformCode = (file: SourceFile) => file.path.startsWith("src/platform/");
const isDomainCommand = (file: SourceFile) =>
  file.path.startsWith("src/platform/people/commands/") ||
  file.path.startsWith("src/platform/configuration/commands/") ||
  file.path.endsWith("employee-aggregate-root.ts");
const isDevelopmentSessionAdapter = (file: SourceFile) => file.path === "src/platform/development-session.ts";
const isAuthPlatformCode = (file: SourceFile) => file.path.startsWith("src/platform/auth/");
// The Configuration Registry (ADR-011) is a read-side platform capability.
const isConfigurationRegistry = (file: SourceFile) => file.path.startsWith("src/platform/configuration/registry/");
const isConfigurationManifest = (file: SourceFile) => file.path === "src/platform/configuration/registry/configuration-manifest.ts";
// The Organization domain (ADR-012) is a peer domain — never coupled to Configuration.
const isConfigurationCode = (file: SourceFile) => file.path.startsWith("src/platform/configuration/");
const isOrganizationCode = (file: SourceFile) => file.path.startsWith("src/platform/organization/");
const ORGANIZATION_READ_REPOSITORY_FILES = new Set([
  "src/platform/organization/prisma-org-unit-read-repository.ts",
  "src/platform/organization/prisma-assignment-read-repository.ts",
  "src/platform/organization/prisma-location-read-repository.ts",
]);
const isOrganizationReadRepository = (file: SourceFile) => ORGANIZATION_READ_REPOSITORY_FILES.has(file.path);
// Location is a dimension orthogonal to the OrgUnit tree (ADR-012 §5) — never
// a node within it, never owned by it. OrgUnit code must never reach into it.
const isOrgUnitCode = (file: SourceFile) => file.path.startsWith("src/platform/organization/org-unit");
// The Epic 7B.4 read-side query surface. It composes the three read
// repositories only — never Prisma directly, never the write side.
const isOrganizationQueryService = (file: SourceFile) => file.path === "src/platform/organization/organization-query-service.ts";
// The People-side integration that turns Organization ids into display
// names (replaces the retired organization-reference placeholder). It reads
// through OrganizationQueryService and a minimal employee display lookup —
// never the Organization write side.
const isOrganizationPlacementImplementation = (file: SourceFile) => file.path === "src/platform/people/read-models/prisma-organization-placement-service.ts";
// Epic 7B.5: the Settings > Organization admin UI's trusted server
// composition — mirrors createDurableConfigurationRuntime. A client
// component reaching it directly would bypass organization.view/.manage.
const isOrganizationAdminRuntime = (file: SourceFile) => file.path === "src/platform/organization/organization-admin-runtime.ts";
// Epic 7B.5: page loaders and server actions for the Settings > Organization
// admin UI. These must obtain every read/write capability through
// createOrganizationAdminRuntime() — never Prisma or a write-side module
// directly — so there is exactly one place that composes the runtime.
const isSettingsOrganizationAdminUiCode = (file: SourceFile) =>
  file.path.startsWith("src/platform/organization/admin/") || file.path.startsWith("src/app/(app)/settings/organization/");
// UX refinement: the Employee Profile > Employment tab's Transfer / Change
// Manager / End Placement actions and their supporting read loader. Same
// "must go through the runtime" rule as Settings — a second entry point to
// the same AssignmentService, not a second write path.
const isPeopleEmploymentWriteSurfaceCode = (file: SourceFile) =>
  file.path === "src/platform/people/profile-employment-actions-loader.ts" ||
  file.path.startsWith("src/app/(app)/people/[employeeId]/employment/");

// Everything a Settings-organization-admin-UI file (or the People employment
// write surface) must reach only through createOrganizationAdminRuntime,
// never directly. Importing a *-service.ts module for its exported result
// *types* is not forbidden — both callers use the service only via
// runtime.orgUnits.service etc., never by constructing the service class
// themselves, which is what this list actually guards against.
const ORGANIZATION_RUNTIME_BYPASS_IMPORTS = [
  /^@prisma\/client/,
  /platform\/persistence\/prisma-client/,
  /platform\/organization\/prisma-org-unit-write-repository/,
  /platform\/organization\/org-unit-write-transaction/,
  /platform\/organization\/prisma-org-unit-unit-of-work/,
  /platform\/organization\/in-memory-org-unit-unit-of-work/,
  /platform\/organization\/prisma-assignment-write-repository/,
  /platform\/organization\/assignment-write-transaction/,
  /platform\/organization\/prisma-assignment-unit-of-work/,
  /platform\/organization\/in-memory-assignment-unit-of-work/,
  /platform\/organization\/prisma-location-write-repository/,
  /platform\/organization\/location-write-transaction/,
  /platform\/organization\/prisma-location-unit-of-work/,
  /platform\/organization\/in-memory-location-unit-of-work/,
  /platform\/organization\/prisma-org-unit-read-repository/,
  /platform\/organization\/prisma-assignment-read-repository/,
  /platform\/organization\/prisma-location-read-repository/,
  /platform\/organization\/prisma-organization-employee-directory/,
];

const WRITE_RUNTIME_IMPORTS = [
  /^@prisma\/client/,
  /platform\/persistence\/prisma-client/,
  /unit-of-work/i,
  /platform\/people\/persistence\//,
  /platform\/outbox\//,
  /platform\/configuration\/prisma-configuration-write-repository/,
  /platform\/configuration\/configuration-write-transaction/,
  /platform\/configuration\/prisma-configuration-unit-of-work/,
];

// Server-only configuration composition — the same rationale as
// TRUSTED_CONTEXT_CONSTRUCTION_IMPORTS below: a client component reaching
// these directly would bypass the settings.* permission checks that live in
// the read repositories and command handlers, not in the UI.
const CONFIGURATION_SERVER_ONLY_IMPORTS = [
  /platform\/configuration\/durable-configuration-runtime/,
  /platform\/configuration\/general-settings-loader/,
  /platform\/configuration\/prisma-configuration-read-repository/,
  /platform\/configuration\/prisma-configuration-read-runtime/,
  /platform\/configuration\/prisma-configuration-audit-read-repository/,
  /platform\/configuration\/registry\/configuration-registry-service/,
];

// The registry is read-only (ADR-011 §7). It must never reach the write side.
const CONFIGURATION_WRITE_SIDE_IMPORTS = [
  /platform\/configuration\/commands\//,
  /platform\/configuration\/prisma-configuration-write-repository/,
  /platform\/configuration\/configuration-write-transaction/,
  /platform\/configuration\/prisma-configuration-unit-of-work/,
  /platform\/configuration\/in-memory-configuration-unit-of-work/,
  /platform\/configuration\/durable-configuration-runtime/,
  /unit-of-work/i,
  /platform\/outbox\//,
];

// The static manifest (ADR-011 Layer 1) is pure data — it must not depend on
// tenant persistence, Prisma, or any read/write runtime.
const CONFIGURATION_PERSISTENCE_IMPORTS = [
  /^@prisma\/client/,
  /platform\/persistence\/prisma-client/,
  /platform\/configuration\/prisma-configuration-/,
  /platform\/configuration\/in-memory-configuration-/,
  /platform\/configuration\/configuration-repository/,
];

const WRITE_RUNTIME_MODULE_IMPORTS = [/platform\/people\/commands\//, /platform\/submissions\//, /durable-application-runtime/];

// The Organization write side (ADR-012). The read repository — and any client —
// must never reach these; writes go only through the OrgUnit/Assignment/
// Location services + their UnitOfWork.
const ORGANIZATION_WRITE_SIDE_IMPORTS = [
  /platform\/organization\/prisma-org-unit-write-repository/,
  /platform\/organization\/org-unit-write-transaction/,
  /platform\/organization\/prisma-org-unit-unit-of-work/,
  /platform\/organization\/in-memory-org-unit-unit-of-work/,
  /platform\/organization\/org-unit-service/,
  /platform\/organization\/prisma-assignment-write-repository/,
  /platform\/organization\/assignment-write-transaction/,
  /platform\/organization\/prisma-assignment-unit-of-work/,
  /platform\/organization\/in-memory-assignment-unit-of-work/,
  /platform\/organization\/assignment-service/,
  /platform\/organization\/prisma-location-write-repository/,
  /platform\/organization\/location-write-transaction/,
  /platform\/organization\/prisma-location-unit-of-work/,
  /platform\/organization\/in-memory-location-unit-of-work/,
  /platform\/organization\/location-service/,
];

// Server-only Organization composition a client component must never import.
const ORGANIZATION_SERVER_ONLY_IMPORTS = [
  ...ORGANIZATION_WRITE_SIDE_IMPORTS,
  /platform\/organization\/prisma-org-unit-read-repository/,
  /platform\/organization\/prisma-assignment-read-repository/,
  /platform\/organization\/prisma-location-read-repository/,
  /platform\/organization\/organization-query-service/,
  /platform\/people\/read-models\/prisma-organization-placement-service/,
  /platform\/people\/read-models\/prisma-employee-display-lookup/,
  /platform\/organization\/organization-admin-runtime/,
  /platform\/organization\/prisma-organization-employee-directory/,
  /platform\/organization\/admin\//,
];

// Anything that lets a caller obtain or construct a TrustedRequestContext —
// blocking these imports blocks constructing/supplying tenant, roles, or
// permissions from the client just as effectively as blocking the fields.
const TRUSTED_CONTEXT_CONSTRUCTION_IMPORTS = [
  /platform\/runtime-context/,
  /platform\/development-session/,
  /platform\/auth\/production-request-context/,
  /platform\/auth\/resolve-request-context/,
  /platform\/context$/,
];

const AUTH_SECRET_IMPORTS = [
  /platform\/auth\/password/,
  /platform\/auth\/session-token/,
  /platform\/env$/,
  /platform\/auth\/production-auth-runtime/,
  /platform\/auth\/prisma-user-repository/,
  /platform\/auth\/prisma-session-repository/,
];

export const RULES: Rule[] = [
  {
    name: "client-components-must-not-import-write-runtime",
    appliesTo: isClientComponent,
    forbidden: WRITE_RUNTIME_IMPORTS,
  },
  {
    name: "server-actions-must-go-through-trusted-submission-gateway",
    appliesTo: isServerAction,
    forbidden: [...WRITE_RUNTIME_IMPORTS, /platform\/development-session/, /platform\/auth\/production-request-context/],
  },
  {
    name: "read-runtime-must-not-import-write-runtime",
    appliesTo: isReadRuntime,
    forbidden: WRITE_RUNTIME_MODULE_IMPORTS,
  },
  {
    name: "react-components-must-not-import-prisma-types",
    appliesTo: isReactComponent,
    forbidden: [/^@prisma\/client/],
  },
  {
    name: "platform-must-not-import-nextjs-ui",
    appliesTo: isPlatformCode,
    forbidden: [/^next\/(?!headers$|server$|navigation$)/, /^src\/app\//, /^@\/app\//, /^@\/components\//],
  },
  {
    name: "domain-command-must-not-import-prisma",
    appliesTo: isDomainCommand,
    forbidden: [/^@prisma\/client/, /platform\/persistence\/prisma-client/],
  },
  {
    name: "client-components-must-not-import-auth-secrets",
    appliesTo: isClientComponent,
    forbidden: AUTH_SECRET_IMPORTS,
  },
  {
    name: "client-components-must-not-construct-trusted-context",
    appliesTo: isClientComponent,
    forbidden: TRUSTED_CONTEXT_CONSTRUCTION_IMPORTS,
  },
  {
    name: "development-session-must-not-import-production-auth",
    appliesTo: isDevelopmentSessionAdapter,
    forbidden: [/platform\/auth\/production-/, /platform\/auth\/prisma-/, /platform\/auth\/login-service/],
  },
  {
    name: "auth-code-must-not-import-people-ui",
    appliesTo: isAuthPlatformCode,
    forbidden: [/^@\/components\//, /^src\/app\/\(app\)\//, /^@\/app\/\(app\)\//],
  },
  {
    name: "domain-command-must-not-import-session-apis",
    appliesTo: isDomainCommand,
    forbidden: [/^next-auth/, /^@auth\//, /^next\/headers$/, /^next\/navigation$/],
  },
  {
    name: "client-components-must-not-import-configuration-server-composition",
    appliesTo: isClientComponent,
    forbidden: CONFIGURATION_SERVER_ONLY_IMPORTS,
  },
  {
    name: "configuration-registry-must-not-import-write-side",
    appliesTo: isConfigurationRegistry,
    forbidden: CONFIGURATION_WRITE_SIDE_IMPORTS,
  },
  {
    name: "configuration-manifest-must-not-import-persistence",
    appliesTo: isConfigurationManifest,
    forbidden: CONFIGURATION_PERSISTENCE_IMPORTS,
  },
  {
    name: "organization-read-repository-must-not-import-write-side",
    appliesTo: isOrganizationReadRepository,
    forbidden: ORGANIZATION_WRITE_SIDE_IMPORTS,
  },
  {
    name: "client-components-must-not-import-organization-server-composition",
    appliesTo: isClientComponent,
    forbidden: ORGANIZATION_SERVER_ONLY_IMPORTS,
  },
  {
    // ADR-012: Organization and Configuration are peer domains and must not
    // couple. Configuration never owns hierarchy; Organization never owns policy.
    name: "configuration-must-not-import-organization",
    appliesTo: isConfigurationCode,
    forbidden: [/platform\/organization\//],
  },
  {
    name: "organization-must-not-import-configuration",
    appliesTo: isOrganizationCode,
    forbidden: [/platform\/configuration\//],
  },
  {
    // ADR-012 §5: Location is orthogonal to the OrgUnit tree, not a node in
    // it and never owned by it — OrgUnit must never reach into Location code.
    name: "org-unit-must-not-import-location",
    appliesTo: isOrgUnitCode,
    forbidden: [/platform\/organization\/location/],
  },
  {
    // Epic 7B.4: every organizational query must go through the read
    // repositories (which themselves resolve through Assignment) — never
    // straight to Prisma. This is what keeps "queries must not bypass
    // Assignment" mechanically true, not just a convention.
    name: "organization-query-service-must-not-import-prisma-directly",
    appliesTo: isOrganizationQueryService,
    forbidden: [/^@prisma\/client/, /platform\/persistence\/prisma-client/],
  },
  {
    // A read-only query surface must never be able to mutate an aggregate.
    name: "organization-query-service-must-not-import-write-side",
    appliesTo: isOrganizationQueryService,
    forbidden: ORGANIZATION_WRITE_SIDE_IMPORTS,
  },
  {
    name: "organization-placement-service-must-not-import-write-side",
    appliesTo: isOrganizationPlacementImplementation,
    forbidden: ORGANIZATION_WRITE_SIDE_IMPORTS,
  },
  {
    // ADR-012 §4: Organization never depends on People — only the reverse.
    // The same precedent as PersonExistenceRepository (queries the employees
    // table directly rather than importing People module code), now made
    // mechanical for every file under src/platform/organization/.
    name: "organization-must-not-import-people",
    appliesTo: isOrganizationCode,
    forbidden: [/platform\/people\//],
  },
  {
    // Epic 7B.5: every Settings > Organization admin page, loader, and
    // server action must obtain read/write capability through
    // createOrganizationAdminRuntime() — never Prisma, a Prisma read
    // repository, or a UnitOfWork/write-repository module directly.
    // organization-admin-runtime.ts itself is exempt (it is the one file
    // allowed to compose these). Importing a *-service.ts module for its
    // exported result *types* (e.g. OrgUnitCreated) is not forbidden — the
    // actions call the service only via runtime.orgUnits.service etc., never
    // by constructing OrgUnitService/LocationService/AssignmentService
    // themselves, which is what this rule actually guards against.
    name: "settings-organization-admin-ui-must-not-bypass-runtime",
    appliesTo: (file) => isSettingsOrganizationAdminUiCode(file) && !isOrganizationAdminRuntime(file),
    forbidden: ORGANIZATION_RUNTIME_BYPASS_IMPORTS,
  },
  {
    name: "people-employment-write-surface-must-not-bypass-runtime",
    appliesTo: isPeopleEmploymentWriteSurfaceCode,
    forbidden: ORGANIZATION_RUNTIME_BYPASS_IMPORTS,
  },
];

/** Pure scan: given source files, returns every boundary violation found. Deterministic, no filesystem access. */
export function scanImportBoundaries(files: readonly SourceFile[]): BoundaryViolation[] {
  const violations: BoundaryViolation[] = [];
  for (const file of files) {
    for (const rule of RULES) {
      if (!rule.appliesTo(file)) continue;
      for (const specifier of importsOf(file.content)) {
        if (rule.forbidden.some((pattern) => pattern.test(specifier))) {
          violations.push({ path: file.path, rule: rule.name, matchedImport: specifier });
        }
      }
    }
  }
  return violations;
}
