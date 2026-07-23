"use client";

import { Bell, AlertTriangle, Info, CheckCircle2, AlertOctagon } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { StatusDot } from "@/components/ui/primitives";
import { useOutsideClick } from "@/lib/hooks";
import { useUIStore } from "@/stores/ui-store";
import {
  NOTIFICATIONS,
  type NotificationKind,
  type MockNotification,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";

const kindIcon: Record<NotificationKind, typeof Info> = {
  critical: AlertOctagon,
  warning: AlertTriangle,
  info: Info,
  success: CheckCircle2,
};

const kindColor: Record<NotificationKind, string> = {
  critical: "text-danger",
  warning: "text-warning",
  info: "text-info",
  success: "text-success",
};

const kindDot: Record<NotificationKind, "danger" | "warning" | "info" | "success"> = {
  critical: "danger",
  warning: "warning",
  info: "info",
  success: "success",
};

function NotificationRow({ n }: { n: MockNotification }) {
  const Icon = kindIcon[n.kind];
  return (
    <div className="flex gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-muted">
      <span className={cn("mt-0.5 shrink-0", kindColor[n.kind])}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium leading-snug text-foreground">
            {n.title}
          </p>
          {n.unread ? <StatusDot tone={kindDot[n.kind]} className="mt-1.5 shrink-0" /> : null}
        </div>
        <p className="mt-0.5 text-xs leading-snug text-muted-foreground">{n.body}</p>
        <p className="mt-1 text-[11px] text-muted-foreground/70">{n.time}</p>
      </div>
    </div>
  );
}

export function Notifications() {
  const open = useUIStore((s) => s.overlay === "notifications");
  const toggle = useUIStore((s) => s.openNotifications);
  const close = useUIStore((s) => s.closeOverlays);
  const ref = useOutsideClick<HTMLDivElement>(close, open);

  const unread = NOTIFICATIONS.filter((n) => n.unread).length;

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <IconButton label="Notifications" onClick={toggle}>
          <Bell className="h-[18px] w-[18px]" />
        </IconButton>
        {unread > 0 ? (
          <span className="pointer-events-none absolute right-1.5 top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[10px] font-semibold text-white ring-2 ring-surface">
            {unread}
          </span>
        ) : null}
      </div>

      {open ? (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute right-0 z-40 mt-2 w-[360px] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-surface shadow-overlay animate-scale-in"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
            <button className="text-xs font-medium text-primary hover:underline">
              Mark all read
            </button>
          </div>

          {NOTIFICATIONS.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Bell className="mx-auto h-6 w-6 text-muted-foreground/60" />
              <p className="mt-2 text-sm font-medium text-foreground">
                You&apos;re all caught up
              </p>
              <p className="text-xs text-muted-foreground">
                New alerts will appear here.
              </p>
            </div>
          ) : (
            <div className="max-h-[420px] overflow-y-auto p-1.5">
              {NOTIFICATIONS.map((n) => (
                <NotificationRow key={n.id} n={n} />
              ))}
            </div>
          )}

          <div className="border-t border-border px-4 py-2.5 text-center">
            <button className="text-xs font-medium text-muted-foreground hover:text-foreground">
              View all notifications
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
