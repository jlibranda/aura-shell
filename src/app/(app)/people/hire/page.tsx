import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { RuntimeHirePage } from "@/components/people/hire/runtime-hire-page";
import { hasPermission } from "@/platform/context";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createTenantContext } from "@/platform/runtime-context";
import { loadRuntimeHireReferences } from "@/platform/people/runtime-hire-loader";

export const metadata: Metadata = { title: "Hire employee" };
export const dynamic = "force-dynamic";

export default async function HireRoute() {
  // resolveRequestContext() redirects unauthenticated requests to /login;
  // an authenticated-but-unauthorized user reaching this point directly
  // (not via the gated "Add employee" link) gets a controlled denial instead
  // of the hire wizard.
  const context = createTenantContext(await resolveRequestContext());
  if (!hasPermission(context, "people.employee.hire")) {
    return <AccessDenied message="You don't have permission to hire employees." />;
  }
  return <RuntimeHirePage references={await loadRuntimeHireReferences()} />;
}
