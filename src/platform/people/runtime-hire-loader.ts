import { createApplicationRuntime } from "@/platform/application-runtime";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { emptyRuntimeHireReferences, type RuntimeHireReferences } from "@/platform/people/runtime-hire-view-model";

/** Server-owned safe reference loader. It never forwards session or tenant context to the browser. */
export async function loadRuntimeHireReferences(): Promise<RuntimeHireReferences> {
  // Resolved outside the try/catch below so an unauthenticated production
  // request's redirect() to /login is never swallowed into empty references.
  const context = await resolveRequestContext();
  try {
    const runtime = createApplicationRuntime(context);
    const [departments, teams, managers] = await Promise.all([runtime.organizationReferences.list(runtime.context, "department"), runtime.organizationReferences.list(runtime.context, "team"), runtime.organizationReferences.list(runtime.context, "manager")]);
    return { departments, teams, managers };
  } catch { return emptyRuntimeHireReferences(); }
}
