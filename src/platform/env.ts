import { ApplicationError } from "@/platform/errors";

export type NodeEnvironment = "development" | "production" | "test";

export interface ValidatedEnvironment {
  readonly nodeEnv: NodeEnvironment;
  readonly databaseUrl: string;
  readonly nextAuthSecret: string;
  readonly appUrl: string;
}

export class EnvironmentValidationError extends ApplicationError {
  constructor(public readonly issues: readonly string[]) {
    super("ENVIRONMENT_INVALID", `Environment validation failed: ${issues.join("; ")}`, { issues });
  }
}

const VALID_NODE_ENVS = new Set<NodeEnvironment>(["development", "production", "test"]);
const MIN_SECRET_LENGTH = 32;

function isValidDatabaseUrl(value: string): boolean {
  try {
    return new URL(value).protocol === "postgresql:" || new URL(value).protocol === "postgres:";
  } catch {
    return false;
  }
}

function isValidHttpUrl(value: string): boolean {
  try {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Validates required runtime configuration. Collects every issue instead of
 * failing on the first one so a single run reports the full remediation list.
 * Never substitutes a default for a missing secret.
 */
export function validateEnvironment(source: Record<string, string | undefined> = process.env): ValidatedEnvironment {
  const issues: string[] = [];

  const nodeEnv = source.NODE_ENV;
  if (!nodeEnv) issues.push("NODE_ENV is required");
  else if (!VALID_NODE_ENVS.has(nodeEnv as NodeEnvironment)) issues.push(`NODE_ENV must be one of development, production, test (received "${nodeEnv}")`);

  const databaseUrl = source.DATABASE_URL;
  if (!databaseUrl?.trim()) issues.push("DATABASE_URL is required");
  else if (!isValidDatabaseUrl(databaseUrl)) issues.push("DATABASE_URL must be a valid postgresql connection string");

  const nextAuthSecret = source.NEXTAUTH_SECRET;
  if (!nextAuthSecret?.trim()) issues.push("NEXTAUTH_SECRET is required");
  else if (nextAuthSecret.trim().length < MIN_SECRET_LENGTH) issues.push(`NEXTAUTH_SECRET must be at least ${MIN_SECRET_LENGTH} characters`);

  const appUrl = source.APP_URL;
  if (!appUrl?.trim()) issues.push("APP_URL is required");
  else if (!isValidHttpUrl(appUrl)) issues.push("APP_URL must be a valid http(s) URL");

  if (issues.length > 0) throw new EnvironmentValidationError(issues);

  return Object.freeze({
    nodeEnv: nodeEnv as NodeEnvironment,
    databaseUrl: databaseUrl as string,
    nextAuthSecret: nextAuthSecret as string,
    appUrl: appUrl as string,
  });
}
