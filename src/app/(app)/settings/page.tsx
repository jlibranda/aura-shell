import type { Metadata } from "next";
import { Settings } from "lucide-react";
import { ModulePlaceholder } from "@/components/shell/module-placeholder";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <ModulePlaceholder
      icon={Settings}
      title="Settings"
      description="Company, policies, permissions, and integrations."
      points={[
        "Company profile, entities, and pay policies.",
        "Roles and permissions for every team member.",
        "Integrations and multi-country configuration.",
      ]}
    />
  );
}
