import Link from "next/link";
import { ArrowLeft, Briefcase } from "lucide-react";
import { Avatar } from "@/components/ui/overlay";
import { EmployeeStatusBadge } from "@/components/people/shared/employee-status-badge";
import type { ProfileOverviewViewModel } from "@/platform/people/profile-runtime-loader";

export function ProfileHeader({ overview }: { overview: ProfileOverviewViewModel }) {
  return (
    <div className="space-y-4">
      <Link href="/people" className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" />
        Back to directory
      </Link>
      <div className="flex items-start gap-4">
        <Avatar name={overview.displayName} size="lg" className="h-16 w-16 text-lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{overview.displayName}</h1>
            <EmployeeStatusBadge status={overview.employmentStatus} />
          </div>
          <p className="mt-1 text-sm text-foreground">{overview.position}</p>
          <p className="mt-3 inline-flex items-center gap-1.5 font-mono text-xs text-muted-foreground">
            <Briefcase className="h-3.5 w-3.5" />
            {overview.employeeNumber}
          </p>
        </div>
      </div>
    </div>
  );
}
