"use client";

import { StickyNote, Lock, Users2, Globe } from "lucide-react";
import { ProfileSectionCard } from "@/components/people/profile/profile-section-card";
import { WorkspaceEmpty } from "@/components/people/profile/workspace-empty";
import { WorkspaceSummaryCard } from "@/components/people/profile/workspace-summary-card";
import { Avatar } from "@/components/ui/overlay";
import { Badge } from "@/components/ui/primitives";
import { useEmployee } from "@/lib/people/people-repository";
import {
  toNoteViews,
  NOTE_VISIBILITY_LABEL,
  type NoteVisibility,
  type NoteView,
} from "@/lib/people/workspace-presentation";
import { longDate } from "@/lib/people/format";
import type { Employee } from "@/lib/people/people-types";

const VISIBILITY_META: Record<NoteVisibility, { tone: "neutral" | "info" | "success"; icon: typeof Lock }> = {
  hr_only: { tone: "neutral", icon: Lock },
  manager: { tone: "info", icon: Users2 },
  public: { tone: "success", icon: Globe },
};

function NoteItem({ note }: { note: NoteView }) {
  const meta = VISIBILITY_META[note.visibility];
  const Icon = meta.icon;
  return (
    <div className="flex gap-3 border-b border-border py-4 first:pt-0 last:border-0 last:pb-0">
      <Avatar name={note.author} size="sm" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-foreground">{note.author}</span>
            <Badge tone={meta.tone} className="gap-1">
              <Icon className="h-3 w-3" />
              {NOTE_VISIBILITY_LABEL[note.visibility]}
            </Badge>
          </div>
          <span className="tabular text-xs text-muted-foreground">{longDate(note.createdAt)}</span>
        </div>
        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-foreground">
          {note.body}
        </p>
      </div>
    </div>
  );
}

export function NotesTab({ employee }: { employee: Employee }) {
  const live = useEmployee(employee.id) ?? employee;
  const notes = toNoteViews(live.notes);

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <ProfileSectionCard title="Notes" icon={StickyNote}>
          {notes.length === 0 ? (
            <WorkspaceEmpty
              icon={StickyNote}
              title="No notes yet"
              description="Internal notes about this employee will appear here."
            />
          ) : (
            <div>
              {notes.map((note) => (
                <NoteItem key={note.id} note={note} />
              ))}
            </div>
          )}
        </ProfileSectionCard>
      </div>

      <WorkspaceSummaryCard employee={employee} />
    </div>
  );
}