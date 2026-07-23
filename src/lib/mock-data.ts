/**
 * Placeholder data for the UI-only shell. None of this is business logic or
 * real data — it exists purely so the shell renders realistically. Every value
 * here is replaced by real data in later epics.
 */

export interface MockUser {
  name: string;
  email: string;
  role: string;
  initials: string;
}

export const CURRENT_USER: MockUser = {
  name: "Maria Santos",
  email: "maria.santos@northwind.ph",
  role: "HR & Payroll Officer",
  initials: "MS",
};

export interface Entity {
  id: string;
  name: string;
  region: string;
}

export const ENTITIES: Entity[] = [
  { id: "nw-ph", name: "Northwind Manila", region: "Philippines" },
  { id: "nw-cebu", name: "Northwind Cebu", region: "Philippines" },
  { id: "nw-hold", name: "Northwind Holdings", region: "Philippines" },
];

export type NotificationKind = "critical" | "warning" | "info" | "success";

export interface MockNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  body: string;
  time: string;
  unread: boolean;
}

export const NOTIFICATIONS: MockNotification[] = [
  {
    id: "n1",
    kind: "critical",
    title: "SSS remittance due in 2 days",
    body: "The July contribution file is prepared and awaiting review.",
    time: "10m ago",
    unread: true,
  },
  {
    id: "n2",
    kind: "warning",
    title: "3 employees missing timesheets",
    body: "Cebu branch — the current period cannot close until resolved.",
    time: "1h ago",
    unread: true,
  },
  {
    id: "n3",
    kind: "info",
    title: "Payroll cutoff approaching",
    body: "Semi-monthly run closes Friday at 5:00 PM.",
    time: "3h ago",
    unread: true,
  },
  {
    id: "n4",
    kind: "success",
    title: "Onboarding complete",
    body: "Juan Dela Cruz is now payroll-ready.",
    time: "Yesterday",
    unread: false,
  },
];

export interface SearchGroup {
  label: string;
  items: { id: string; title: string; subtitle: string }[];
}

export const SEARCH_PLACEHOLDER_RESULTS: SearchGroup[] = [
  {
    label: "People",
    items: [
      { id: "p1", title: "Ana Reyes", subtitle: "Finance · Manila" },
      { id: "p2", title: "Miguel Cruz", subtitle: "Operations · Cebu" },
      { id: "p3", title: "Juan Dela Cruz", subtitle: "Support · Manila" },
    ],
  },
  {
    label: "Pages",
    items: [
      { id: "s1", title: "Run payroll", subtitle: "Payroll" },
      { id: "s2", title: "Leave calendar", subtitle: "Leave" },
    ],
  },
];

/** Seeded prompts shown in the Copilot dock (UI only — no responses). */
export const COPILOT_PROMPTS: string[] = [
  "Why did total SSS go up this month?",
  "Show me everyone who got overtime this cycle",
  "Which employees are missing a TIN?",
  "Summarize what needs my attention today",
];

/** Simple spark series for placeholder widgets. */
export const HEADCOUNT_SERIES = [180, 184, 188, 191, 196, 203, 208, 214];
export const LABOR_COST_SERIES = [3.1, 3.2, 3.15, 3.4, 3.35, 3.6, 3.72, 3.9];

export interface Deadline {
  agency: string;
  label: string;
  due: string;
  daysLeft: number;
}

export const COMPLIANCE_DEADLINES: Deadline[] = [
  { agency: "SSS", label: "Contribution remittance", due: "Jul 31", daysLeft: 2 },
  { agency: "BIR", label: "Withholding tax (1601-C)", due: "Aug 10", daysLeft: 12 },
  { agency: "PhilHealth", label: "Premium remittance", due: "Aug 15", daysLeft: 17 },
  { agency: "Pag-IBIG", label: "Contribution remittance", due: "Aug 15", daysLeft: 17 },
];

export interface Activity {
  who: string;
  action: string;
  target: string;
  time: string;
}

export const RECENT_ACTIVITY: Activity[] = [
  { who: "Maria Santos", action: "approved leave for", target: "Ana Reyes", time: "12m ago" },
  { who: "System", action: "flagged missing timesheets in", target: "Cebu", time: "1h ago" },
  { who: "Miguel Cruz", action: "submitted overtime for", target: "his team", time: "2h ago" },
  { who: "Maria Santos", action: "prepared remittance for", target: "SSS July", time: "4h ago" },
  { who: "Grace Lim", action: "updated policy", target: "Leave — 2025", time: "Yesterday" },
];

export interface Insight {
  title: string;
  detail: string;
  tone: "positive" | "attention" | "neutral";
}

export const AI_INSIGHTS: Insight[] = [
  {
    title: "Overtime is trending up in Cebu",
    detail: "Cebu overtime is 18% above last period. Worth a look before the run closes.",
    tone: "attention",
  },
  {
    title: "Headcount grew 3.2% this quarter",
    detail: "8 new hires, all payroll-ready. Turnover held steady.",
    tone: "positive",
  },
];
