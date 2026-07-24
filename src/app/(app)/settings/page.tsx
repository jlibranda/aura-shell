import type { Metadata } from "next";
import { Building2, ClipboardList, Landmark, ShieldCheck, Sliders, Wallet } from "lucide-react";
import { SettingsCategoryCard, type SettingsCategoryCardStatus } from "@/components/settings/settings-category-card";
import { loadSettingsHome } from "@/platform/configuration/general-settings-loader";

export const metadata: Metadata = { title: "Settings" };
export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const { general, auditVisible } = await loadSettingsHome();
  const generalStatus: SettingsCategoryCardStatus = general.visible ? general.status : "coming_soon";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Settings</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Company defaults, access, and policies for your organization. Changes are versioned and take effect on a date you choose.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SettingsCategoryCard
          icon={Sliders}
          title="General"
          description="Company name, time zone, locale, currency, and the working-week defaults other policies build on."
          status={generalStatus}
          href={general.visible ? "/settings/general" : undefined}
        />
        <SettingsCategoryCard
          icon={Building2}
          title="Organization"
          description="Legal entities, departments, and reporting structure."
          status="coming_soon"
        />
        <SettingsCategoryCard
          icon={ShieldCheck}
          title="Access Control"
          description="Roles, permissions, and who can see or change what."
          status="coming_soon"
        />
        <SettingsCategoryCard
          icon={ClipboardList}
          title="Timekeeping"
          description="Shift rules, attendance, and time-off policies. Full policy catalog arrives in a later slice."
          status="coming_soon"
        />
        <SettingsCategoryCard
          icon={Wallet}
          title="Payroll"
          description="Pay schedules, statutory rules, and compensation policies. Full policy catalog arrives in a later slice."
          status="coming_soon"
        />
        {auditVisible ? (
          <SettingsCategoryCard
            icon={Landmark}
            title="Audit and Diagnostics"
            description="Who changed what, and when — across every settings category."
            status="available"
            href="/settings/audit"
          />
        ) : null}
      </div>
    </div>
  );
}
