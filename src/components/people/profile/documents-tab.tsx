"use client";

import { useMemo, useState } from "react";
import { FolderClosed, Search, X, FileText, User, Calendar, Building2 } from "lucide-react";
import { ProfileSectionCard } from "@/components/people/profile/profile-section-card";
import { DocumentStatusBadge } from "@/components/people/profile/document-status-badge";
import { WorkspaceEmpty } from "@/components/people/profile/workspace-empty";
import { WorkspaceSummaryCard } from "@/components/people/profile/workspace-summary-card";
import { Card } from "@/components/ui/primitives";
import { useEmployeeDocuments } from "@/lib/people/people-repository";
import {
  groupDocuments,
  isExpiringSoon,
  type DocumentView,
} from "@/lib/people/workspace-presentation";
import { longDate } from "@/lib/people/format";
import type { Employee } from "@/lib/people/people-types";
import { cn } from "@/lib/utils";

function DocumentCard({ view }: { view: DocumentView }) {
  const expiring = isExpiringSoon(view);
  return (
    <Card className="flex flex-col p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              view.status === "expired"
                ? "bg-danger/10 text-danger"
                : "bg-primary/10 text-primary",
            )}
          >
            <FileText className="h-4.5 w-4.5" />
          </span>
          <div className="min-w-0">
            <h4 className="truncate text-sm font-medium text-foreground">{view.name}</h4>
            <p className="text-xs text-muted-foreground">{view.categoryLabel}</p>
          </div>
        </div>
        <DocumentStatusBadge status={view.status} expiring={expiring} />
      </div>

      <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-xs">
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <User className="h-3.5 w-3.5" /> Uploaded by
          </span>
          <span className="truncate font-medium text-foreground">{view.uploadedBy}</span>
        </div>
        <div className="flex items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <Calendar className="h-3.5 w-3.5" /> Upload date
          </span>
          <span className="tabular font-medium text-foreground">{longDate(view.uploadedAt)}</span>
        </div>
        {view.expiresAt ? (
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Calendar className="h-3.5 w-3.5" /> Expires
            </span>
            <span
              className={cn(
                "tabular font-medium",
                view.status === "expired" ? "text-danger" : expiring ? "text-warning" : "text-foreground",
              )}
            >
              {longDate(view.expiresAt)}
            </span>
          </div>
        ) : null}
      </div>
    </Card>
  );
}

export function DocumentsTab({ employee }: { employee: Employee }) {
  const documents = useEmployeeDocuments(employee.id);
  const [term, setTerm] = useState("");

  const groups = useMemo(() => groupDocuments(documents), [documents]);

  const filteredGroups = useMemo(() => {
    const q = term.trim().toLowerCase();
    if (!q) return groups;
    return groups.map((group) => ({
      ...group,
      documents: group.documents.filter(
        (d) =>
          d.name.toLowerCase().includes(q) ||
          d.categoryLabel.toLowerCase().includes(q),
      ),
    }));
  }, [groups, term]);

  const totalDocs = documents.length;
  const anyResults = filteredGroups.some((g) => g.documents.length > 0);

  if (totalDocs === 0) {
    return (
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <ProfileSectionCard title="Documents" icon={FolderClosed}>
            <WorkspaceEmpty
              icon={FolderClosed}
              title="No documents on file"
              description="This employee has no documents recorded yet."
            />
          </ProfileSectionCard>
        </div>
        <WorkspaceSummaryCard employee={employee} />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            placeholder="Search by filename or category…"
            aria-label="Search documents"
            className="h-9 w-full rounded-md border border-input bg-surface pl-9 pr-9 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/25"
          />
          {term ? (
            <button
              onClick={() => setTerm("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground focus-visible:outline-none"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {!anyResults ? (
          <WorkspaceEmpty
            icon={Search}
            title={`No documents match “${term}”`}
            description="Try a different filename or category."
          />
        ) : (
          filteredGroups.map((group) => (
            <ProfileSectionCard key={group.key} title={group.label} icon={Building2}>
              {group.documents.length === 0 ? (
                <WorkspaceEmpty
                  icon={FolderClosed}
                  title={`No ${group.label.toLowerCase()} documents`}
                />
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {group.documents.map((doc) => (
                    <DocumentCard key={doc.id} view={doc} />
                  ))}
                </div>
              )}
            </ProfileSectionCard>
          ))
        )}
      </div>

      <WorkspaceSummaryCard employee={employee} />
    </div>
  );
}