import Link from "next/link";
import { ShieldAlert } from "lucide-react";

/** The controlled denial screen for an authenticated-but-unauthorized request. Never a raw exception. */
export function AccessDenied({ message = "You don't have permission to view this page." }: { message?: string }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-surface-muted text-muted-foreground">
        <ShieldAlert className="h-7 w-7" />
      </span>
      <p className="mt-6 text-sm font-medium text-muted-foreground">Error 403</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Access denied</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">{message}</p>
      <Link href="/home" className="mt-6 inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90">
        Back to dashboard
      </Link>
    </div>
  );
}
