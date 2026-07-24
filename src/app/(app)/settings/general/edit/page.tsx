import type { Metadata } from "next";
import { AccessDenied } from "@/components/shared/access-denied";
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
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Edit General Company Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Changes are saved as a draft. Nothing here affects the live system until you review and publish it.</p>
      </div>
      <GeneralSettingsEditor
        initialPayload={initialPayload}
        versionId={draft?.id}
        expectedUpdatedAt={draft?.updatedAt}
      />
    </div>
  );
}
