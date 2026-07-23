/**
 * People status machine.
 * Declarative status metadata, the actions each status permits, and the result
 * (new status + timeline event) of the actions that transition state. Consumed
 * by the action menu and action drawers so users only ever see valid actions.
 */
import type {
  ActionType,
  EmployeeStatus,
  StatusTone,
  TimelineEventType,
} from "@/lib/people/people-types";

export interface StatusMeta {
  label: string;
  tone: StatusTone;
  description: string;
  /** Statuses considered "currently employed" for the Active umbrella filter. */
  employed: boolean;
}

export const STATUS_META: Record<EmployeeStatus, StatusMeta> = {
  probationary: {
    label: "Probationary",
    tone: "info",
    description: "Newly hired and within the probationary period.",
    employed: true,
  },
  regular: {
    label: "Regular",
    tone: "success",
    description: "Regularized and permanently employed.",
    employed: true,
  },
  active: {
    label: "Active",
    tone: "success",
    description: "Currently active employee.",
    employed: true,
  },
  on_leave: {
    label: "On Leave",
    tone: "warning",
    description: "Temporarily away on an approved leave.",
    employed: true,
  },
  suspended: {
    label: "Suspended",
    tone: "warning",
    description: "Temporarily suspended.",
    employed: false,
  },
  resigned: {
    label: "Resigned",
    tone: "neutral",
    description: "Voluntarily exited the company.",
    employed: false,
  },
  terminated: {
    label: "Terminated",
    tone: "danger",
    description: "Involuntarily separated from the company.",
    employed: false,
  },
  retired: {
    label: "Retired",
    tone: "neutral",
    description: "Retired from the company.",
    employed: false,
  },
};

/** The statuses the "Active" umbrella expands to in directory filtering. */
export const ACTIVE_UMBRELLA: EmployeeStatus[] = [
  "active",
  "probationary",
  "regular",
  "on_leave",
];

export const ALL_STATUSES: EmployeeStatus[] = [
  "probationary",
  "regular",
  "active",
  "on_leave",
  "suspended",
  "resigned",
  "terminated",
  "retired",
];

export interface ActionMeta {
  label: string;
  verb: string;
  description: string;
  destructive: boolean;
}

export const ACTION_META: Record<ActionType, ActionMeta> = {
  hire: {
    label: "Hire",
    verb: "Hire",
    description: "Add a new employee to the organization.",
    destructive: false,
  },
  edit: {
    label: "Edit",
    verb: "Save changes",
    description: "Correct or update profile details.",
    destructive: false,
  },
  promote: {
    label: "Promote",
    verb: "Promote",
    description: "Move the employee into a new position.",
    destructive: false,
  },
  transfer: {
    label: "Transfer",
    verb: "Transfer",
    description: "Move the employee to a new department, team, or location.",
    destructive: false,
  },
  salary_change: {
    label: "Salary change",
    verb: "Record change",
    description: "Record a change to base compensation.",
    destructive: false,
  },
  change_manager: {
    label: "Change manager",
    verb: "Reassign",
    description: "Reassign the employee's reporting manager.",
    destructive: false,
  },
  approve: {
    label: "Approve",
    verb: "Approve",
    description: "Approve a pending request for this employee.",
    destructive: false,
  },
  suspend: {
    label: "Suspend",
    verb: "Suspend",
    description: "Temporarily suspend the employee.",
    destructive: true,
  },
  reactivate: {
    label: "Reactivate",
    verb: "Reactivate",
    description: "Return the employee to active duty.",
    destructive: false,
  },
  terminate: {
    label: "Terminate",
    verb: "Terminate",
    description: "Involuntarily separate the employee.",
    destructive: true,
  },
  offboard: {
    label: "Offboard",
    verb: "Start offboarding",
    description: "Run the offboarding checklist and archive the record.",
    destructive: true,
  },
};

/** Actions available for a given stored status. */
export const ALLOWED_ACTIONS: Record<EmployeeStatus, ActionType[]> = {
  probationary: [
    "edit",
    "promote",
    "transfer",
    "salary_change",
    "change_manager",
    "approve",
    "suspend",
    "terminate",
  ],
  regular: [
    "edit",
    "promote",
    "transfer",
    "salary_change",
    "change_manager",
    "approve",
    "suspend",
    "terminate",
  ],
  active: [
    "edit",
    "promote",
    "transfer",
    "salary_change",
    "change_manager",
    "approve",
    "suspend",
    "terminate",
  ],
  on_leave: ["edit", "change_manager", "reactivate", "terminate"],
  suspended: ["edit", "reactivate", "terminate"],
  resigned: ["offboard"],
  terminated: ["offboard"],
  retired: ["offboard"],
};

export interface ActionResult {
  /** New status after the action, if it transitions state. */
  status?: EmployeeStatus;
  /** Timeline event the action writes, if any. */
  timeline?: TimelineEventType;
}

export const ACTION_RESULT: Record<ActionType, ActionResult> = {
  hire: { status: "probationary", timeline: "hired" },
  edit: {},
  promote: { timeline: "promoted" },
  transfer: { timeline: "transferred" },
  salary_change: { timeline: "salary_change" },
  change_manager: { timeline: "manager_change" },
  approve: { timeline: "approved" },
  suspend: { status: "suspended", timeline: "suspended" },
  reactivate: { status: "regular", timeline: "reactivated" },
  terminate: { status: "terminated", timeline: "terminated" },
  offboard: { timeline: "offboarded" },
};

export function getStatusMeta(status: EmployeeStatus): StatusMeta {
  return STATUS_META[status];
}

export function getAllowedActions(status: EmployeeStatus): ActionType[] {
  return ALLOWED_ACTIONS[status] ?? [];
}

export function isActionAllowed(
  status: EmployeeStatus,
  action: ActionType,
): boolean {
  return getAllowedActions(status).includes(action);
}

export function getActionMeta(action: ActionType): ActionMeta {
  return ACTION_META[action];
}