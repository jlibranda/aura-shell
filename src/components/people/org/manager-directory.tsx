"use client";

import Link from "next/link";
import { UserCog, Users } from "lucide-react";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { Avatar } from "@/components/ui/overlay";
import { fullName } from "@/lib/people/directory-query";
import type { ManagerView } from "@/lib/people/org-presentation";

function ManagerCard({ view }: { view: ManagerView }) {
  return (
    <Link
      href={`/people/${view.manager.id}`}
      className="focus-visible:outline-none"
    >
      <Card className="flex items-center gap-3 p-4 transition-shadow duration-200 hover:shadow-sm">
        <Avatar name={fullName(view.manager)} size="lg" />
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-foreground">
            {fullName(view.manager)}
          </h3>
          <p className="truncate text-xs text-muted-foreground">
            {view.manager.employment.positionTitle}
          </p>
          <p className="truncate text-xs text-muted-foreground">{view.departmentName}</p>
        </div>
        <Badge tone="primary" className="gap-1">
          <Users className="h-3 w-3" />
          {view.directReports}
        </Badge>
      </Card>
    </Link>
  );
}

export function ManagerDirectory({ views }: { views: ManagerView[] }) {
  if (views.length === 0) {
    return (
      <EmptyState
        icon={UserCog}
        title="No managers found"
        description="No managers match your current search and filters."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {views.map((view) => (
        <ManagerCard key={view.manager.id} view={view} />
      ))}
    </div>
  );
}