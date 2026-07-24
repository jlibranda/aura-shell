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
  file.path.startsWith("src/platform/people/commands/") || file.path.endsWith("employee-aggregate-root.ts");
const isDevelopmentSessionAdapter = (file: SourceFile) => file.path === "src/platform/development-session.ts";
const isAuthPlatformCode = (file: SourceFile) => file.path.startsWith("src/platform/auth/");

const WRITE_RUNTIME_IMPORTS = [
  /^@prisma\/client/,
  /platform\/persistence\/prisma-client/,
  /unit-of-work/i,
  /platform\/people\/persistence\//,
  /platform\/outbox\//,
];

const WRITE_RUNTIME_MODULE_IMPORTS = [/platform\/people\/commands\//, /platform\/submissions\//, /durable-application-runtime/];

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
