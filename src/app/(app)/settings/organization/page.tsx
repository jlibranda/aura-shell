import type { Metadata } from "next";
import Link from "next/link";
import { Building2, MapPin, UserCog } from "lucide-react";
import { AccessDenied } from "@/components/shared/access-denied";
import { Card, StatTile } from "@/components/ui/primitives";
import { loadOrganizationOverview } from "@/platform/organization/admin/organization-overview-loader";

export const metadata: Metadata = { title: "Organization" };
export const dynamic = "force-dynamic";

const SECTIONS = [
  { href: "/settings/organization/org-units", title: "Organization Units", description: "Divisions, business units, departments, branches, and teams.", icon: Building2 },
  { href: "/settings/organization/locations", title: "Locations", description: "Physical and recognized work sites.", icon: MapPin },
  { href: "/settings/organization/assignments", title: "Employee Assignments", description: "Who is placed where, and who reports to whom.", icon: UserCog },
] as const;

export default async function OrganizationOverviewPage() {
  const result = await loadOrganizationOverview();
  if (result.kind === "unauthorized") return <AccessDenied message="You don't have permission to view the organization structure." />;

  const { counts } = result;

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">Organization</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Organization units, work locations, and who is placed where.</p>
      </div>

      <Card className="mb-6 grid grid-cols-2 gap-6 p-5 sm:grid-cols-3">
        <StatTile label="Active org units" value={String(counts.activeOrgUnits)} />
        <StatTile label="Archived org units" value={String(counts.archivedOrgUnits)} />
        <StatTile label="Active locations" value={String(counts.activeLocations)} />
        <StatTile label="Archived locations" value={String(counts.archivedLocations)} />
        <StatTile label="Employees assigned" value={String(counts.employeesWithAssignment)} />
        <StatTile
          label="Employees unassigned"
          value={String(counts.employeesWithoutAssignment)}
          deltaTone={counts.employeesWithoutAssignment > 0 ? "negative" : "neutral"}
        />
      </Card>

      <div className="grid gap-4 sm:grid-cols-3">
        {SECTIONS.map((section) => (
          <Link key={section.href} href={section.href} className="block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
            <Card className="flex h-full flex-col gap-3 p-5 transition-shadow hover:shadow-sm">
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <section.icon className="h-4 w-4" aria-hidden />
              </span>
              <div>
                <h2 className="text-sm font-semibold text-foreground">{section.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{section.description}</p>
              </div>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
