import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { LocationAdminView } from "@/components/settings/organization/location-admin-view";
import { loadLocationsAdmin } from "@/platform/organization/admin/locations-admin-loader";

export const metadata: Metadata = { title: "Locations" };
export const dynamic = "force-dynamic";

export default async function LocationsAdminPage() {
  const result = await loadLocationsAdmin();
  if (result.kind === "unauthorized") return <AccessDenied message="You don't have permission to view locations." />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Locations" description="Physical and recognized work sites, orthogonal to the organization unit tree." backHref="/settings/organization" />
      <LocationAdminView locations={result.locations} canManage={result.canManage} />
    </div>
  );
}
