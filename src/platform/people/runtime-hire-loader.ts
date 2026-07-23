import { createApplicationRuntime } from "@/platform/application-runtime";
import { getDevelopmentSession } from "@/platform/development-session";
import { emptyRuntimeHireReferences, type RuntimeHireReferences } from "@/platform/people/runtime-hire-view-model";

/** Server-owned safe reference loader. It never forwards session or tenant context to the browser. */
export async function loadRuntimeHireReferences(): Promise<RuntimeHireReferences> {
  try {
    const runtime = createApplicationRuntime(getDevelopmentSession());
    const [departments, teams, managers] = await Promise.all([runtime.organizationReferences.list(runtime.context, "department"), runtime.organizationReferences.list(runtime.context, "team"), runtime.organizationReferences.list(runtime.context, "manager")]);
    return { departments, teams, managers };
  } catch { return emptyRuntimeHireReferences(); }
}
