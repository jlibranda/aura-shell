"use client";

import { useEffect } from "react";
import { IdCard, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import { ProfileSectionCard } from "@/components/people/profile/profile-section-card";
import { GovIdManager } from "@/components/people/gov/gov-id-manager";
import { StatTile } from "@/components/ui/primitives";
import { useGovVerificationStore } from "@/stores/gov-verification-store";
import { resolveGovStatus, govKey, GOV_ID_ORDER } from "@/lib/people/gov-verification";
import type { Employee } from "@/lib/people/people-types";

export function GovernmentIdsTab({ employee }: { employee: Employee }) {
  const hydrate = useGovVerificationStore((s) => s.hydrate);
  const hydrated = useGovVerificationStore((s) => s.hydrated);
  const records = useGovVerificationStore((s) => s.records);

  useEffect(() => {
    if (!hydrated) hydrate();
  }, [hydrated, hydrate]);

  const statuses = GOV_ID_ORDER.map((key) =>
    resolveGovStatus(employee, key, records[govKey(employee.id, key)]),
  );
  const verified = statuses.filter((s) => s === "verified").length;
  const attention = statuses.filter((s) => s === "pending" || s === "rejected").length;
  const missing = statuses.filter((s) => s === "not_provided").length;

  return (
    <div className="space-y-5">
      <ProfileSectionCard title="Verification overview" icon={IdCard}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted/40 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success">
              <ShieldCheck className="h-4.5 w-4.5" />
            </span>
            <StatTile label="Verified" value={String(verified)} />
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted/40 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning">
              <ShieldAlert className="h-4.5 w-4.5" />
            </span>
            <StatTile label="Needs attention" value={String(attention)} />
          </div>
          <div className="flex items-center gap-3 rounded-lg border border-border bg-surface-muted/40 px-4 py-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-muted text-muted-foreground">
              <ShieldX className="h-4.5 w-4.5" />
            </span>
            <StatTile label="Not provided" value={String(missing)} />
          </div>
        </div>
      </ProfileSectionCard>

      <ProfileSectionCard title="Government IDs" icon={IdCard}>
        <GovIdManager employee={employee} />
      </ProfileSectionCard>
    </div>
  );
}