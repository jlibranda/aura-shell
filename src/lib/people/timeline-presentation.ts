import {
  UserPlus,
  ArrowUpCircle,
  ArrowLeftRight,
  Banknote,
  UserCog,
  RefreshCw,
  PauseCircle,
  PlayCircle,
  LogOut,
  XCircle,
  CheckCircle2,
  StickyNote,
  FileUp,
  Award,
  Circle,
  type LucideIcon,
} from "lucide-react";
import type { TimelineEntry, TimelineTone } from "@/components/ui/timeline";
import type { TimelineEvent, TimelineEventType } from "@/lib/people/people-types";
import { relativeTime } from "@/lib/people/format";

const PRESENTATION: Record<TimelineEventType, { icon: LucideIcon; tone: TimelineTone }> = {
  hired: { icon: UserPlus, tone: "success" },
  promoted: { icon: ArrowUpCircle, tone: "primary" },
  transferred: { icon: ArrowLeftRight, tone: "info" },
  salary_change: { icon: Banknote, tone: "primary" },
  manager_change: { icon: UserCog, tone: "info" },
  status_change: { icon: RefreshCw, tone: "neutral" },
  regularized: { icon: Award, tone: "success" },
  suspended: { icon: PauseCircle, tone: "warning" },
  reactivated: { icon: PlayCircle, tone: "success" },
  resigned: { icon: LogOut, tone: "neutral" },
  terminated: { icon: XCircle, tone: "danger" },
  retired: { icon: LogOut, tone: "neutral" },
  offboarded: { icon: LogOut, tone: "neutral" },
  approved: { icon: CheckCircle2, tone: "success" },
  note_added: { icon: StickyNote, tone: "neutral" },
  document_added: { icon: FileUp, tone: "neutral" },
};

export function toTimelineEntry(event: TimelineEvent): TimelineEntry {
  const presentation = PRESENTATION[event.type] ?? { icon: Circle, tone: "neutral" };
  return {
    id: event.id,
    title: event.title,
    description: event.description,
    meta: `by ${event.actor}`,
    timestamp: relativeTime(event.timestamp),
    icon: presentation.icon,
    tone: presentation.tone,
  };
}

export function toTimelineEntries(events: TimelineEvent[]): TimelineEntry[] {
  return events.map(toTimelineEntry);
}