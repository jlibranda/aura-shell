/**
 * People Copilot v1 — shared contract. Deterministic, repository-backed.
 * The PeopleCopilotService interface is what a future LLM-backed
 * implementation (OpenAI/Claude/Groq) would satisfy, so callers never change.
 */
import type { Employee } from "@/lib/people/people-types";
import type { CopilotViewer } from "@/lib/people/copilot/access-policy";

export interface CopilotContext {
  employees: Employee[];
  departments: { id: string; name: string; leadId?: string }[];
  teams: { id: string; name: string; departmentId: string; leadId?: string; memberIds: string[] }[];
  viewer: CopilotViewer;
  activeEmployeeName?: string;
}

export type CopilotResultKind = "employees" | "counts" | "summary" | "text";

export interface CopilotCountRow {
  label: string;
  value: number;
}

export interface CopilotAnswer {
  kind: CopilotResultKind;
  /** One-line grounded explanation of what was computed. */
  headline: string;
  /** Optional supporting detail lines. */
  detail?: string[];
  /** Matching employees (for list results). */
  employees?: Employee[];
  /** Aggregate rows (for count results). */
  counts?: CopilotCountRow[];
  /** True when nothing matched / not understood. */
  empty?: boolean;
  profile?: { employee: Employee; rows: CopilotProfileRow[] };
  governmentId?: CopilotGovernmentId;
  navigation?: { href: string; label: string };
  timeline?: { date: string; title: string; description?: string }[];
}

export interface CopilotProfileRow { label: string; value: string; }
export interface CopilotGovernmentId { employeeId: string; label: string; maskedValue: string; fullValue?: string; status: string; canReveal: boolean; canCopy: boolean; }

export type CopilotActionRisk = "read" | "navigation" | "change" | "sensitive" | "destructive";
export type CopilotActionStatus = "ready" | "confirmation_required" | "blocked" | "unavailable" | "completed" | "cancelled";
export interface CopilotAction { id: string; skillId: string; type: string; label: string; description?: string; risk: CopilotActionRisk; status: CopilotActionStatus; targetEmployeeId?: string; payload?: Record<string, unknown>; confirmationText?: string; navigationTarget?: string; }

export interface PeopleCopilotService {
  ask(question: string, context: CopilotContext): CopilotAnswer;
  suggestions(): string[];
}

export const NOT_FOUND = "I couldn't find that information.";
