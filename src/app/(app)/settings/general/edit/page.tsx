import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
import { PageHeader } from "@/components/shared/page-header";
import { GeneralSettingsEditor } from "@/components/settings/general-settings-editor";
import { loadGeneralSettingsEdit } from "@/platform/configuration/general-settings-loader";
import type { GeneralCompanySettingsPayload } from "@/platform/configuration/general-company-settings";

export const metadata: Metadata = { title: "Edit general settings" };
export const dynamic = "force-dynamic";

export default async function GeneralSettingsEditPage() {
  const result = await loadGeneralSettingsEdit();
  if (result.kind === "unauthorized") return <AccessDenied message="You don't have permission to edit company settings." />;

  const { draft, effective } = result;
  const initialPayload = (draft ?? effective)?.payload as unknown as GeneralCompanySettingsPayload | undefined;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="Edit General Company Settings" description="Changes are saved as a draft. Nothing here affects the live system until you review and publish it." backHref="/settings/general" />
      <GeneralSettingsEditor
        initialPayload={initialPayload}
        versionId={draft?.id}
        expectedUpdatedAt={draft?.updatedAt}
      />
    </div>
  );
}
