import type { GovIdKey } from "@/lib/people/people-types";
import { governmentIdFromText, hasPronounReference, normalizeCopilotText } from "@/lib/people/copilot/normalization";

export type Intent =
  | { kind: "reports_to"; name: string } | { kind: "joined_month"; year: number; month: number } | { kind: "joined_year"; year: number } | { kind: "recent_hires" } | { kind: "on_probation" } | { kind: "count_status"; status: "regular" | "probationary" } | { kind: "department_employees"; name: string } | { kind: "count_by_department" } | { kind: "missing_gov_id"; key: GovIdKey } | { kind: "incomplete_gov_ids" } | { kind: "no_emergency_contact" } | { kind: "no_manager" } | { kind: "missing_mobile" } | { kind: "duplicate_emails" } | { kind: "incomplete_records" } | { kind: "regularizable_next_month" } | { kind: "summarize"; name: string } | { kind: "missing_info"; name: string } | { kind: "search"; name: string }
  | { kind: "employee_profile"; name: string } | { kind: "employee_contact"; name: string; field: "work_email" | "personal_email" | "mobile" } | { kind: "employee_manager"; name: string } | { kind: "employee_department"; name: string } | { kind: "employee_position"; name: string } | { kind: "employee_hire_date"; name: string } | { kind: "employee_team"; name: string } | { kind: "employee_status"; name: string } | { kind: "employee_employee_number"; name: string } | { kind: "employee_emergency_contact"; name: string } | { kind: "employee_government_id"; name: string; key: GovIdKey; action: "view" | "reveal" | "copy" } | { kind: "employee_government_overview"; name: string } | { kind: "employee_compensation"; name: string } | { kind: "employee_documents"; name: string } | { kind: "employee_timeline"; name: string } | { kind: "employee_navigation"; name: string; tab: "profile" | "government-ids" | "employment" | "documents" | "timeline" } | { kind: "navigate"; href: string; label: string } | { kind: "unknown" };

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const GOV_KEYS: Record<string, GovIdKey> = { tin: "tin", sss: "sss", philhealth: "philhealth", pagibig: "pagibig", "pag-ibig": "pagibig" };
const personName = (text: string): string | null => {
  const possessive = text.match(/(?:what is|show|open|view|display|who is|pakita|ipakita|buksan)\s+(.+?)(?:'s|â€™s)\s+(?:profile|government ids?|government numbers?|work email|personal email|mobile number|phone number|emergency contact|manager|department|position|job title|hire date|team|status|employee number|employee id|tin|sss|philhealth|pag-?ibig|compensation|salary|allowance|documents?)/i);
  if (possessive?.[1]) return possessive[1].trim();
  const directed = text.match(/(?:for|of|about)\s+(.+?)(?:\?\s*)?$/i);
  if (directed?.[1]) return directed[1].trim();
  const taggedProfile = text.match(/^(?:open|view|display|show|pakita|ipakita|buksan|pumunta sa)\s+(?:employee )?(?:profile|record|details?)\s+(?:ni|si|of|for|kay)\s+(.+?)\??$/i);
  if (taggedProfile?.[1]) return taggedProfile[1].trim();
  const directShow = text.match(/^(?:show|open|view|display|pakita|ipakita|buksan)\s+(?:si\s+)?([a-z][a-z .'-]+?)(?:\?\s*)?$/i);
  if (directShow?.[1]) return directShow[1].trim();
  const identity = text.match(/who is\s+(.+?)(?:\?\s*)?$/i);
  return identity?.[1]?.trim() || null;
};

export function parseIntent(raw: string, activeEmployeeName?: string): Intent {
  const text = raw.trim(); const lower = normalizeCopilotText(raw); const now = new Date(); const govKey = governmentIdFromText(lower); let name = personName(text);
  const fieldQuery = /\b(employee number|employee id|manager|supervisor|department|team|position|mobile|email|tin|sss|philhealth|pagibig|profile)\b/.test(lower);
  if (!name && fieldQuery && !hasPronounReference(lower)) {
    const candidate = lower.replace(/\b(employee number|employee id|manager|supervisor|department|team|position|mobile|work email|email|tin|sss|philhealth|pagibig|government|id|number|no|show|find|display|who is|sino si|ni|si|kay|of|for)\b/g, " ").replace(/\s+/g, " ").trim();
    name = candidate || null;
  }
  if (!name && (hasPronounReference(lower) || fieldQuery)) name = activeEmployeeName ?? null;
  if (govKey && !name) {
    const candidate = lower.replace(/\b(pagibig|philhealth|tin|sss|tax|identification|social|security|government|id|number|no|ano|yung|ang|ni|si|kay|of|for|show|display|pakita|ipakita|patingin)\b/g, " ").replace(/\s+/g, " ").trim();
    name = candidate || activeEmployeeName || null;
  }
  if (!lower) return { kind: "unknown" };
  const navigation: Record<string, { href: string; label: string }> = { people: { href: "/people", label: "People" }, employees: { href: "/people", label: "People" }, payroll: { href: "/payroll", label: "Payroll" }, leave: { href: "/leave", label: "Leave" }, attendance: { href: "/time", label: "Time" }, time: { href: "/time", label: "Time" }, reports: { href: "/reports", label: "Reports" } };
  const navTarget = lower.match(/^(?:open|go to|navigate to)\s+(people|employees|payroll|leave|attendance|time|reports)\??$/)?.[1];
  if (navTarget) return { kind: "navigate", ...navigation[navTarget] };
  const tab = /government ids?|government numbers?/.test(lower) ? "government-ids" : /employment/.test(lower) ? "employment" : /documents?/.test(lower) ? "documents" : /timeline/.test(lower) ? "timeline" : /profile/.test(lower) ? "profile" : null;
  if (tab && /\b(open|go to|navigate|buksan|pumunta|view)\b/.test(lower) && name) return { kind: "employee_navigation", name, tab };
  // Analytics must win over person/profile fallbacks: "Who is on probation?" is not a name lookup.
  if (/how many regular|count.*regular|number of regular/.test(lower)) return { kind: "count_status", status: "regular" };
  if (/how many probation|count.*probation|number of probation/.test(lower)) return { kind: "count_status", status: "probationary" };
  if (/count (?:employees )?by department|headcount by department|employees per department|department breakdown/.test(lower)) return { kind: "count_by_department" };
  if (/(?:who(?:'s| is| are)?|show|list).*(on probation|probationary)/.test(lower)) return { kind: "on_probation" };
  if (/recent hires?|latest hires?|newest employees?/.test(lower)) return { kind: "recent_hires" };
  if (/regulariz(?:e|ed|able|ation).*(next month|soon)|who becomes regular/.test(lower)) return { kind: "regularizable_next_month" };
  if (/missing (?:a |an |their )?(tin|sss|philhealth|pagibig)/.test(lower)) { const key = governmentIdFromText(lower); if (key) return { kind: "missing_gov_id", key }; }
  if (/who has no emergency contact|without emergency contact|missing emergency contact|walang emergency contact/.test(lower)) return { kind: "no_emergency_contact" };
  if (/government ids? missing|missing government ids?|incomplete government/.test(lower)) return { kind: "incomplete_gov_ids" };
  if (/department headcount|\bheadcount\b|employee count|ilan ang employees per department/.test(lower)) return { kind: "count_by_department" };
  if (/employees hired this month|newly hired|new employees|bagong hire/.test(lower)) return { kind: "recent_hires" };
  if (/sino ang probi|sino ang probationary/.test(lower)) return { kind: "on_probation" };
  if (/mareregular|upcoming regularization|employees becoming regular/.test(lower)) return { kind: "regularizable_next_month" };
  if (name && /timeline|employment history|history/.test(lower)) return { kind: "employee_timeline", name };
  if (name && /government ids?|government numbers?/.test(lower)) return { kind: "employee_government_overview", name };
  if (govKey && !/missing|incomplete/.test(lower) && name) return { kind: "employee_government_id", name, key: govKey, action: /reveal/.test(lower) ? "reveal" : /copy/.test(lower) ? "copy" : "view" };
  if (name && /(?:show|who is|profile|tell me about|find|open|employee|pakita|ipakita|buksan|pumunta)/.test(lower)) return { kind: "employee_profile", name };
  if (name && /work email/.test(lower)) return { kind: "employee_contact", name, field: "work_email" };
  if (name && /personal email/.test(lower)) return { kind: "employee_contact", name, field: "personal_email" };
  if (name && /mobile|phone number/.test(lower)) return { kind: "employee_contact", name, field: "mobile" };
  if (name && /emergency contact/.test(lower)) return { kind: "employee_emergency_contact", name };
  if (name && /(?:manager|reports to)/.test(lower)) return { kind: "employee_manager", name };
  if (name && /department/.test(lower)) return { kind: "employee_department", name };
  if (name && /position|job title/.test(lower)) return { kind: "employee_position", name };
  if (name && /hire date|when .* hired/.test(lower)) return { kind: "employee_hire_date", name };
  if (name && /team/.test(lower)) return { kind: "employee_team", name };
  if (name && /regular|probationary|status/.test(lower)) return { kind: "employee_status", name };
  if (name && /employee number|employee id/.test(lower)) return { kind: "employee_employee_number", name };
  if (name && /compensation|salary|allowance/.test(lower)) return { kind: "employee_compensation", name };
  if (name && /documents?/.test(lower)) return { kind: "employee_documents", name };
  const reports = text.match(/who reports to (.+?)\??$/i); if (reports) return { kind: "reports_to", name: reports[1].trim() };
  const missing = lower.match(/missing (?:a |an |their )?(tin|sss|philhealth|pag-?ibig)/); if (missing) return { kind: "missing_gov_id", key: GOV_KEYS[missing[1]] ?? "tin" };
  if (/incomplete government|incomplete gov|incomplete ids|missing government ids/.test(lower)) return { kind: "incomplete_gov_ids" };
  if (/no emergency contact|without emergency|missing emergency/.test(lower)) return { kind: "no_emergency_contact" }; if (/no manager|without (?:a )?manager|missing manager/.test(lower)) return { kind: "no_manager" }; if (/missing mobile|no mobile|without mobile|missing phone/.test(lower)) return { kind: "missing_mobile" }; if (/duplicate email/.test(lower)) return { kind: "duplicate_emails" }; if (/incomplete record|incomplete profile|incomplete data/.test(lower)) return { kind: "incomplete_records" }; if (/regulariz(?:e|ed|able|ation).*(next month|soon)|who can be regularized/.test(lower)) return { kind: "regularizable_next_month" };
  if (/how many regular|count.*regular|number of regular/.test(lower)) return { kind: "count_status", status: "regular" }; if (/how many probation|count.*probation|number of probation/.test(lower)) return { kind: "count_status", status: "probationary" }; if (/count (?:employees )?by department|headcount by department|employees per department|department breakdown/.test(lower)) return { kind: "count_by_department" }; if (/(?:who(?:'s| is| are)?|show|list).*(on probation|probationary)/.test(lower)) return { kind: "on_probation" };
  if (/join(?:ed)? this month|hired this month|new hires? this month/.test(lower)) return { kind: "joined_month", year: now.getFullYear(), month: now.getMonth() }; const joinedMonth = lower.match(/join(?:ed)?(?: in)? (january|february|march|april|may|june|july|august|september|october|november|december)(?:\s+(\d{4}))?/); if (joinedMonth) return { kind: "joined_month", year: joinedMonth[2] ? Number(joinedMonth[2]) : now.getFullYear(), month: MONTHS.indexOf(joinedMonth[1]) }; const joinedYear = lower.match(/join(?:ed)?(?: in)? (\d{4})/); if (joinedYear) return { kind: "joined_year", year: Number(joinedYear[1]) }; if (/recent hires?|latest hires?|newest employees?/.test(lower)) return { kind: "recent_hires" };
  const summarize = text.match(/summar(?:ize|y)(?: of| for)? (.+?)\??$/i); if (summarize) return { kind: "summarize", name: summarize[1].trim() }; const missingInfo = text.match(/what(?:'s| is) missing (?:from|for) (.+?)\??$/i); if (missingInfo) return { kind: "missing_info", name: missingInfo[1].trim() };
  const search = text.match(/search (?:for )?(.+?)\??$/i) || text.match(/find (?:everyone |anyone )?(?:named |called )?(.+?)\??$/i); if (search) return { kind: "search", name: search[1].trim() };
  return { kind: "unknown" };
}
