import { fullName } from "@/lib/people/directory-query";
import type { CopilotContext } from "@/lib/people/copilot/types";
import type { Employee } from "@/lib/people/people-types";

export type EmployeeResolution = { status: "resolved"; employee: Employee; confidence: number; source: "exact" | "partial" | "typo" } | { status: "ambiguous"; candidates: Employee[] } | { status: "not_found"; searchedText: string };
const normalize = (value: string) => value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
function distance(left: string, right: string): number { const row = Array.from({ length: right.length + 1 }, (_, index) => index); for (let i = 1; i <= left.length; i += 1) { let previous = row[0]; row[0] = i; for (let j = 1; j <= right.length; j += 1) { const saved = row[j]; row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previous + (left[i - 1] === right[j - 1] ? 0 : 1)); previous = saved; } } return row[right.length]; }
export function resolveEmployee(ctx: CopilotContext, query: string): EmployeeResolution {
  const searchedText = normalize(query); const exact = ctx.employees.filter((employee) => { const name = normalize(fullName(employee)); const reversed = normalize(`${employee.personal.lastName} ${employee.personal.firstName}`); return name === searchedText || reversed === searchedText || normalize(employee.personal.firstName) === searchedText || normalize(employee.personal.lastName) === searchedText; });
  if (exact.length === 1) return { status: "resolved", employee: exact[0], confidence: 1, source: "exact" }; if (exact.length > 1) return { status: "ambiguous", candidates: exact };
  const partial = ctx.employees.filter((employee) => normalize(fullName(employee)).includes(searchedText)); if (partial.length === 1) return { status: "resolved", employee: partial[0], confidence: 0.8, source: "partial" }; if (partial.length > 1) return { status: "ambiguous", candidates: partial };
  const typo = ctx.employees.filter((employee) => { const parts = searchedText.split(" "); const nameParts = normalize(fullName(employee)).split(" "); return parts.every((part) => nameParts.some((namePart) => distance(part, namePart) <= (part.length > 5 ? 2 : 1))); });
  if (typo.length === 1) return { status: "resolved", employee: typo[0], confidence: 0.6, source: "typo" }; if (typo.length > 1) return { status: "ambiguous", candidates: typo }; return { status: "not_found", searchedText: query };
}
