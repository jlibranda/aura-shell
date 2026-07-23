import { parseIntent } from "@/lib/people/copilot/intent-parser";
import { peopleCopilot } from "@/lib/people/copilot/people-copilot-service";
import type { CopilotAnswer, CopilotContext } from "@/lib/people/copilot/types";

type FeatureId = "analytics" | "government" | "organization" | "employee-information" | "employee-profile" | "employee-lookup";
const ANALYTICS = new Set(["on_probation", "regularizable_next_month", "recent_hires", "missing_gov_id", "incomplete_gov_ids", "no_emergency_contact", "no_manager", "missing_mobile", "incomplete_records", "count_status", "count_by_department", "joined_month", "joined_year"]);
const ORGANIZATION = new Set(["reports_to", "employee_manager"]);
const INFORMATION = new Set(["employee_department", "employee_position", "employee_hire_date", "employee_team", "employee_status", "employee_employee_number"]);

export function routePeopleFeature(question: string, context: CopilotContext): FeatureId {
  const intent = parseIntent(question, context.activeEmployeeName).kind;
  if (ANALYTICS.has(intent)) return "analytics";
  if (intent === "employee_government_id") return "government";
  if (ORGANIZATION.has(intent)) return "organization";
  if (INFORMATION.has(intent)) return "employee-information";
  if (intent === "employee_profile" || intent === "summarize" || intent === "employee_timeline") return "employee-profile";
  return "employee-lookup";
}

export function executePeopleFeature(question: string, context: CopilotContext): CopilotAnswer {
  const feature = routePeopleFeature(question, context); const startedAt = Date.now(); const response = peopleCopilot.ask(question, context);
  if (process.env.NODE_ENV === "development") console.debug("[PeopleSkill]", { feature, executionMs: Date.now() - startedAt, responseKind: response.kind });
  return response;
}
