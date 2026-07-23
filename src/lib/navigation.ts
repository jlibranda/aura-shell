import {
  LayoutDashboard,
  Users,
  Banknote,
  Clock,
  CalendarDays,
  HeartPulse,
  BarChart3,
  Sparkles,
  Settings,
  type LucideIcon,
} from "lucide-react";

/**
 * The single source of truth for AURA's primary navigation.
 * Sidebar, breadcrumbs, and the command palette all read from here so they
 * can never drift apart. `permission` and `audience` are declared now but
 * unused this sprint — role-gating and the simplified employee nav drop in
 * later without a refactor.
 */
export type NavAudience = "admin" | "employee" | "both";

export interface NavItem {
  key: string;
  label: string;
  href: string;
  icon: LucideIcon;
  section: "workspace" | "operations" | "insights" | "system";
  description: string;
  permission?: string; // reserved for role-aware gating (unused in Sprint 1)
  audience: NavAudience; // reserved for the employee-facing simplified nav
}

export const NAV_ITEMS: NavItem[] = [
  {
    key: "home",
    label: "Home",
    href: "/home",
    icon: LayoutDashboard,
    section: "workspace",
    description: "Your personalized dashboard and daily briefing.",
    permission: "home.view",
    audience: "both",
  },
  {
    key: "people",
    label: "People",
    href: "/people",
    icon: Users,
    section: "operations",
    description: "Employee directory, records, and org structure.",
    permission: "people.view",
    audience: "admin",
  },
  {
    key: "payroll",
    label: "Payroll",
    href: "/payroll",
    icon: Banknote,
    section: "operations",
    description: "Pay runs, payslips, and statutory filings.",
    permission: "payroll.view",
    audience: "admin",
  },
  {
    key: "time",
    label: "Time",
    href: "/time",
    icon: Clock,
    section: "operations",
    description: "Timekeeping, schedules, and attendance.",
    permission: "time.view",
    audience: "both",
  },
  {
    key: "leave",
    label: "Leave",
    href: "/leave",
    icon: CalendarDays,
    section: "operations",
    description: "Balances, requests, and leave calendars.",
    permission: "leave.view",
    audience: "both",
  },
  {
    key: "benefits",
    label: "Benefits",
    href: "/benefits",
    icon: HeartPulse,
    section: "operations",
    description: "Statutory and company benefits.",
    permission: "benefits.view",
    audience: "both",
  },
  {
    key: "reports",
    label: "Reports",
    href: "/reports",
    icon: BarChart3,
    section: "insights",
    description: "Analytics, statutory reports, and exports.",
    permission: "reports.view",
    audience: "admin",
  },
  {
    key: "copilot",
    label: "Copilot",
    href: "/copilot",
    icon: Sparkles,
    section: "insights",
    description: "The full AI Copilot workspace.",
    permission: "copilot.view",
    audience: "both",
  },
  {
    key: "settings",
    label: "Settings",
    href: "/settings",
    icon: Settings,
    section: "system",
    description: "Company, policies, permissions, and integrations.",
    permission: "settings.view",
    audience: "admin",
  },
];

export const NAV_SECTIONS: {
  key: NavItem["section"];
  label: string;
}[] = [
  { key: "workspace", label: "Workspace" },
  { key: "operations", label: "Operations" },
  { key: "insights", label: "Insights" },
  { key: "system", label: "System" },
];

/** Resolve the nav item that owns a given pathname. */
export function navItemForPath(pathname: string): NavItem | undefined {
  return NAV_ITEMS.find(
    (item) => pathname === item.href || pathname.startsWith(item.href + "/"),
  );
}
