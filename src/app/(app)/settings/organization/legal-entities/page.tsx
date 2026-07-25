import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { LegalEntityAdminView } from "@/components/settings/organization/legal-entity-admin-view";
import { loadLegalEntitiesAdmin } from "@/platform/organization/admin/legal-entities-admin-loader";

export const metadata: Metadata = { title: "Legal Entities" };
export const dynamic = "force-dynamic";

export default async function LegalEntitiesAdminPage() {
  const result = await loadLegalEntitiesAdmin();
  if (result.kind === "unauthorized") return <AccessDenied message="You don't have permission to view legal entities." />;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader title="Legal Entities" description="Registered employers of record. Every organization unit belongs to exactly one legal entity." backHref="/settings/organization" />
      <LegalEntityAdminView legalEntities={result.legalEntities} canManage={result.canManage} />
    </div>
  );
}
