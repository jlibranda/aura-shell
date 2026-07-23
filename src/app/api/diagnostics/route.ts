import packageJson from "../../../../package.json";
import { ensureStartupValidated, getStartupState } from "@/platform/startup";

export const dynamic = "force-dynamic";

/**
 * Safe operational diagnostics only: version, startup/migration/environment
 * state. Never the connection string, secrets, or any credential value.
 */
export async function GET(): Promise<Response> {
  await ensureStartupValidated();
  const state = getStartupState();

  const body =
    state.status === "pending"
      ? { version: packageJson.version, startup: { status: "pending" as const }, environment: "unknown", migrations: "unknown" }
      : state.status === "ready"
        ? { version: packageJson.version, startup: { status: "ready" as const, at: state.startedAt }, environment: state.checks.environment, migrations: state.checks.migrations }
        : { version: packageJson.version, startup: { status: "failed" as const, at: state.startedAt }, environment: state.checks.environment ?? "unknown", migrations: state.checks.migrations ?? "unknown" };

  return Response.json(body, { status: 200 });
}
