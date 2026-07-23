import type { GovIdKey } from "@/lib/people/people-types";

const FILLERS = ["can you", "could you", "would you", "please", "kindly", "tell me", "i want to know", "i need", "paki", "pakiusap", "nga", "naman", "po", "sana", "pwede", "yung", "ang"];
const REPLACEMENTS: Record<string, string> = { "pag ibig": "pagibig", "pag ibg": "pagibig", "pagibg": "pagibig", hdmf: "pagibig", "mid number": "pagibig", "membership id": "pagibig", "phil health": "philhealth", phic: "philhealth", philheath: "philhealth", philhealt: "philhealth", goverment: "government", governement: "government", maneger: "manager", employe: "employee", "employee no": "employee number", "employee identifier": "employee number", "employee code": "employee number", "emp number": "employee number", "emp no": "employee number", "emp id": "employee number", "emp code": "employee number", "staff number": "employee number", "staff id": "employee number", "company id": "employee number", "employee record number": "employee number" };
const GOV_IDS: Record<string, GovIdKey> = { tin: "tin", "tax id": "tin", "tax identification": "tin", bir: "tin", sss: "sss", "social security": "sss", philhealth: "philhealth", pagibig: "pagibig" };

export function normalizeCopilotText(raw: string): string {
  let value = raw.toLowerCase().replace(/(?:emp|employee)\s*#/g, "employee number").replace(/[’']/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/[-_/]+/g, " ").replace(/\s+/g, " ").trim();
  for (const filler of FILLERS) value = value.replace(new RegExp(`\\b${filler}\\b`, "g"), " ");
  for (const [alias, canonical] of Object.entries(REPLACEMENTS)) value = value.replace(new RegExp(`\\b${alias}\\b`, "g"), canonical);
  return value.replace(/\s+/g, " ").trim();
}

export function governmentIdFromText(normalized: string): GovIdKey | undefined {
  return Object.entries(GOV_IDS).find(([alias]) => normalized.includes(alias))?.[1];
}

export function hasPronounReference(normalized: string): boolean {
  return /\b(her|his|their|siya|niya|nya|kanya|employee)\b/.test(normalized);
}
