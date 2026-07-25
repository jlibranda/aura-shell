import { invalid, issue, valid, type ValidationResult } from "@/platform/validation";

/**
 * LegalEntity — the registered employer of record (ADR-013). A peer
 * Organization aggregate, never an OrgUnit `kind`: every OrgUnit belongs to
 * exactly one Legal Entity (ownership, not attribute — ADR-013 §3), and every
 * Assignment records the Legal Entity of the OrgUnit it places a person into.
 *
 * `id` and `code` are stable identity — immutable and never reused. A rename
 * changes the display name (`legalName`) only. Legal Entities are archived,
 * never hard-deleted; an archived entity remains historically resolvable but
 * is excluded from active-only listings (Hire, OrgUnit creation).
 *
 * Deliberately narrow scope (ADR-013 §3): no tax registrations, statutory
 * account numbers, bank accounts, payroll calendars, benefit plans,
 * accounting setup, or country payroll rules — those attach later, when
 * Payroll is built.
 */

export const LEGAL_ENTITY_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type LegalEntityStatus = (typeof LEGAL_ENTITY_STATUSES)[number];

/** Immutable read record of one legal entity. */
export interface LegalEntityRecord {
  id: string;
  tenantId: string;
  code: string;
  legalName: string;
  /** ISO 3166-1 alpha-2, e.g. "PH", "SG", "US". */
  countryCode: string;
  status: LegalEntityStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  archivedAt?: string;
}

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,49}$/;
const COUNTRY_CODE_PATTERN = /^[A-Z]{2}$/;

function isValidCountryCode(value: string): boolean {
  return COUNTRY_CODE_PATTERN.test(value);
}

export interface CreateLegalEntityDraft {
  code: string;
  legalName: string;
  countryCode: string;
}

export interface ValidatedCreateLegalEntityDraft {
  code: string;
  legalName: string;
  countryCode: string;
}

/**
 * Server-authoritative validation for a new legal entity's own fields. The
 * code is normalized (trimmed + upper-cased) so "ACME" and "acme" can never
 * become two distinct entities. Uniqueness is enforced by the write service
 * against live data, not here.
 */
export function validateCreateLegalEntityDraft(input: CreateLegalEntityDraft): ValidationResult<ValidatedCreateLegalEntityDraft> {
  const issues = [];
  const normalizedCode = input.code?.trim().toUpperCase() ?? "";
  if (!normalizedCode) issues.push(issue("code", "REQUIRED", "A short, stable code is required."));
  else if (!CODE_PATTERN.test(normalizedCode)) issues.push(issue("code", "INVALID_FORMAT", "Code must be 1-50 characters: letters, numbers, dot, dash, or underscore, starting with a letter or number."));

  if (!input.legalName?.trim()) issues.push(issue("legalName", "REQUIRED", "A registered legal name is required."));

  const normalizedCountry = input.countryCode?.trim().toUpperCase() ?? "";
  if (!normalizedCountry) issues.push(issue("countryCode", "REQUIRED", "A country is required."));
  else if (!isValidCountryCode(normalizedCountry)) issues.push(issue("countryCode", "INVALID_FORMAT", `"${input.countryCode}" is not a valid two-letter ISO country code.`));

  if (issues.length > 0) return invalid(issues);
  return valid({ code: normalizedCode, legalName: input.legalName!.trim(), countryCode: normalizedCountry });
}

export interface UpdateLegalEntityDetailsInput {
  legalName: string;
  countryCode: string;
}

export interface ValidatedLegalEntityDetails {
  legalName: string;
  countryCode: string;
}

/**
 * Validates the mutable descriptive attributes of a legal entity — legal name
 * and country. Identity (id, code) is never part of this input; there is
 * deliberately no way to change it.
 */
export function validateUpdateLegalEntityDetails(input: UpdateLegalEntityDetailsInput): ValidationResult<ValidatedLegalEntityDetails> {
  const issues = [];
  if (!input.legalName?.trim()) issues.push(issue("legalName", "REQUIRED", "A registered legal name is required."));

  const normalizedCountry = input.countryCode?.trim().toUpperCase() ?? "";
  if (!normalizedCountry) issues.push(issue("countryCode", "REQUIRED", "A country is required."));
  else if (!isValidCountryCode(normalizedCountry)) issues.push(issue("countryCode", "INVALID_FORMAT", `"${input.countryCode}" is not a valid two-letter ISO country code.`));

  if (issues.length > 0) return invalid(issues);
  return valid({ legalName: input.legalName!.trim(), countryCode: normalizedCountry });
}
