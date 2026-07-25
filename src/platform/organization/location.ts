import { invalid, issue, valid, type ValidationIssue, type ValidationResult } from "@/platform/validation";

/**
 * Location — a physical or recognized work site (ADR-012 §5). A dimension
 * orthogonal to the OrgUnit tree: a department may operate across several
 * locations, and a location may host people from many org units. Location is
 * never a node in the hierarchy and never an OrgUnit `kind`.
 *
 * `id` and `code` are stable identity — immutable and never reused. A rename
 * changes the display name only. Locations are archived, never hard-deleted;
 * an archived location remains historically resolvable but cannot be reused
 * under a new identity and is excluded from active-only listings.
 */

export const LOCATION_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type LocationStatus = (typeof LOCATION_STATUSES)[number];

/**
 * A location's street address. A value object with no identity or lifecycle
 * of its own — it lives only as part of a Location. Deliberately loose about
 * shape (no state/province required, no postal-code format enforced) so the
 * model works outside the Philippines; this is normalization, not a global
 * address-validation engine.
 */
export interface Address {
  line1: string;
  line2?: string;
  city: string;
  region?: string;
  postalCode?: string;
}

export interface AddressInput {
  line1?: string;
  line2?: string;
  city?: string;
  region?: string;
  postalCode?: string;
}

/** Immutable read record of one location. */
export interface LocationRecord {
  id: string;
  tenantId: string;
  code: string;
  name: string;
  address: Address;
  /** ISO 3166-1 alpha-2, e.g. "PH", "SG", "US". */
  countryCode: string;
  /** IANA time zone identifier, e.g. "Asia/Manila". */
  timezone: string;
  status: LocationStatus;
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

/**
 * IANA identifiers are validated using the runtime's own time zone database
 * (`Intl.DateTimeFormat` throws for an unrecognized zone) rather than a
 * hand-maintained registry — the same technique Configuration's general
 * company settings use, reimplemented here rather than imported, since
 * Organization must never depend on Configuration (ADR-012 §4).
 */
function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function validateAddress(input: AddressInput, path: string): { issues: ValidationIssue[]; address?: Address } {
  const issues: ValidationIssue[] = [];
  const line1 = input.line1?.trim();
  const city = input.city?.trim();
  if (!line1) issues.push(issue(`${path}.line1`, "REQUIRED", "An address line is required."));
  if (!city) issues.push(issue(`${path}.city`, "REQUIRED", "A city is required."));
  if (issues.length > 0) return { issues };
  return {
    issues,
    address: {
      line1: line1!,
      city: city!,
      ...(input.line2?.trim() ? { line2: input.line2.trim() } : {}),
      ...(input.region?.trim() ? { region: input.region.trim() } : {}),
      ...(input.postalCode?.trim() ? { postalCode: input.postalCode.trim() } : {}),
    },
  };
}

export interface CreateLocationDraft {
  code: string;
  name: string;
  address: AddressInput;
  countryCode: string;
  timezone: string;
}

export interface ValidatedCreateLocationDraft {
  code: string;
  name: string;
  address: Address;
  countryCode: string;
  timezone: string;
}

/**
 * Server-authoritative validation for a new location's own fields. The code
 * is normalized (trimmed + upper-cased) so "HQ" and "hq" can never become two
 * distinct locations. Uniqueness is enforced by the write service against
 * live data, not here.
 */
export function validateCreateLocationDraft(input: CreateLocationDraft): ValidationResult<ValidatedCreateLocationDraft> {
  const issues = [];
  const normalizedCode = input.code?.trim().toUpperCase() ?? "";
  if (!normalizedCode) issues.push(issue("code", "REQUIRED", "A short, stable code is required."));
  else if (!CODE_PATTERN.test(normalizedCode)) issues.push(issue("code", "INVALID_FORMAT", "Code must be 1-50 characters: letters, numbers, dot, dash, or underscore, starting with a letter or number."));
  if (!input.name?.trim()) issues.push(issue("name", "REQUIRED", "A name is required."));

  const normalizedCountry = input.countryCode?.trim().toUpperCase() ?? "";
  if (!normalizedCountry) issues.push(issue("countryCode", "REQUIRED", "A country is required."));
  else if (!isValidCountryCode(normalizedCountry)) issues.push(issue("countryCode", "INVALID_FORMAT", `"${input.countryCode}" is not a valid two-letter ISO country code.`));

  if (!input.timezone?.trim()) issues.push(issue("timezone", "REQUIRED", "A time zone is required."));
  else if (!isValidTimeZone(input.timezone)) issues.push(issue("timezone", "UNSUPPORTED", `"${input.timezone}" is not a recognized IANA time zone.`));

  const addressResult = validateAddress(input.address ?? {}, "address");
  issues.push(...addressResult.issues);

  if (issues.length > 0) return invalid(issues);
  return valid({
    code: normalizedCode,
    name: input.name!.trim(),
    address: addressResult.address!,
    countryCode: normalizedCountry,
    timezone: input.timezone!,
  });
}

export interface UpdateLocationDetailsInput {
  name: string;
  address: AddressInput;
  countryCode: string;
  timezone: string;
}

export interface ValidatedLocationDetails {
  name: string;
  address: Address;
  countryCode: string;
  timezone: string;
}

/**
 * Validates the mutable descriptive attributes of a location — name,
 * address, country, and time zone. Identity (id, code) is never part of this
 * input; there is deliberately no way to change it.
 */
export function validateUpdateLocationDetails(input: UpdateLocationDetailsInput): ValidationResult<ValidatedLocationDetails> {
  const issues = [];
  if (!input.name?.trim()) issues.push(issue("name", "REQUIRED", "A name is required."));

  const normalizedCountry = input.countryCode?.trim().toUpperCase() ?? "";
  if (!normalizedCountry) issues.push(issue("countryCode", "REQUIRED", "A country is required."));
  else if (!isValidCountryCode(normalizedCountry)) issues.push(issue("countryCode", "INVALID_FORMAT", `"${input.countryCode}" is not a valid two-letter ISO country code.`));

  if (!input.timezone?.trim()) issues.push(issue("timezone", "REQUIRED", "A time zone is required."));
  else if (!isValidTimeZone(input.timezone)) issues.push(issue("timezone", "UNSUPPORTED", `"${input.timezone}" is not a recognized IANA time zone.`));

  const addressResult = validateAddress(input.address ?? {}, "address");
  issues.push(...addressResult.issues);

  if (issues.length > 0) return invalid(issues);
  return valid({
    name: input.name!.trim(),
    address: addressResult.address!,
    countryCode: normalizedCountry,
    timezone: input.timezone!,
  });
}
