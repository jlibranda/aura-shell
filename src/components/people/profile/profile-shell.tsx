import { ProfileHeader } from "@/components/people/profile/profile-header";
import { ProfileNav } from "@/components/people/profile/profile-nav";
import type { ProfileOverviewViewModel } from "@/platform/people/profile-runtime-loader";

export function ProfileShell({
  overview,
  children,
}: {
  overview: ProfileOverviewViewModel;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-5xl">
      <ProfileHeader overview={overview} />
      <div className="mt-5"><ProfileNav employeeId={overview.employeeId} /></div>
      <div className="mt-6">{children}</div>
      <p className="mt-4 text-sm text-muted-foreground">Read-only runtime profile.</p>
    </div>
  );
}
