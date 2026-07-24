import type { Metadata } from "next";
import { EmptyState } from "@/components/ui/primitives";
import { Settings2 } from "lucide-react";
import { SettingsCategoryCard } from "@/components/settings/settings-category-card";
import { iconForCategory } from "@/components/settings/settings-category-icons";
import { loadSettingsHome } from "@/platform/configuration/general-settings-loader";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { categories } = await loadSettingsHome();

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Company defaults, access, and policies for your organization. Changes are versioned and take effect on a date you choose.
        </p>
      </div>

      {categories.length === 0 ? (
        <EmptyState
          icon={Settings2}
          title="No settings available"
          description="You don't have access to any settings categories. Ask an administrator if you believe this is a mistake."
        />
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <SettingsCategoryCard key={category.key} category={category} icon={iconForCategory(category.key)} />
          ))}
        </div>
      )}
    </div>
  );
}
