"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Briefcase, Contact, FileText, HandCoins, History, IdCard, NotebookText, Package, ShieldAlert, User, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface RuntimeProfileTab {
  key: "overview" | "employment" | "work-information" | "contact-information" | "compensation" | "government-ids" | "documents" | "timeline" | "notes" | "emergency-contacts" | "assets";
  label: string;
  icon: LucideIcon;
  segment: string | null;
  deferred: boolean;
}

export const RUNTIME_PROFILE_TABS: readonly RuntimeProfileTab[] = [
  { key: "overview", label: "Overview", icon: User, segment: null, deferred: false },
  { key: "employment", label: "Employment", icon: Briefcase, segment: "employment", deferred: false },
  { key: "work-information", label: "Work Information", icon: Briefcase, segment: "work-information", deferred: false },
  { key: "contact-information", label: "Contact Information", icon: Contact, segment: "contact-information", deferred: false },
  { key: "compensation", label: "Compensation", icon: HandCoins, segment: "compensation", deferred: true },
  { key: "government-ids", label: "Government IDs", icon: IdCard, segment: "government-ids", deferred: true },
  { key: "documents", label: "Documents", icon: FileText, segment: "documents", deferred: true },
  { key: "timeline", label: "Timeline", icon: History, segment: "timeline", deferred: true },
  { key: "notes", label: "Notes", icon: NotebookText, segment: "notes", deferred: true },
  { key: "emergency-contacts", label: "Emergency Contacts", icon: ShieldAlert, segment: "emergency-contacts", deferred: true },
  { key: "assets", label: "Assets", icon: Package, segment: "assets", deferred: true },
];

export function getRuntimeProfileTabHref(employeeId: string, tab: RuntimeProfileTab) {
  const base = `/people/${employeeId}`;
  return tab.segment ? `${base}/${tab.segment}` : base;
}

export function ProfileNav({ employeeId }: { employeeId: string }) {
  const pathname = usePathname();
  return (
    <nav aria-label="Employee profile" className="sticky top-14 z-20 -mx-4 border-b border-border bg-background/85 px-4 backdrop-blur-md sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="no-scrollbar flex overflow-x-auto" role="tablist">
        {RUNTIME_PROFILE_TABS.map((tab) => {
          const href = getRuntimeProfileTabHref(employeeId, tab);
          const active = pathname === href;
          const Icon = tab.icon;
          return (
            <Link key={tab.key} href={href} role="tab" aria-selected={active} aria-current={active ? "page" : undefined} className={cn("relative inline-flex shrink-0 items-center gap-2 whitespace-nowrap px-3 py-3 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2", active ? "text-foreground" : tab.deferred ? "text-muted-foreground/75 hover:text-foreground" : "text-muted-foreground hover:text-foreground")}>
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.deferred ? <span className="text-xs font-normal text-muted-foreground">Coming soon</span> : null}
              {active ? <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" /> : null}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
