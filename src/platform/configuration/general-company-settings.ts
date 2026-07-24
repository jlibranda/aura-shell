import { invalid, issue, valid, type ValidationResult } from "@/platform/validation";

export const GENERAL_COMPANY_SETTINGS_TYPE = "GENERAL_COMPANY_SETTINGS" as const;
export const GENERAL_COMPANY_SETTINGS_CODE = "general" as const;
export const GENERAL_COMPANY_SETTINGS_SCHEMA_VERSION = 1;

export const DAYS_OF_WEEK = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const DATE_FORMATS = ["YYYY-MM-DD", "MM/DD/YYYY", "DD/MM/YYYY", "DD-MMM-YYYY"] as const;
export type DateFormat = (typeof DATE_FORMATS)[number];

export const TIME_FORMATS = ["12H", "24H"] as const;
export type TimeFormat = (typeof TIME_FORMATS)[number];

/**
 * The universal, country-agnostic tenant defaults future policy modules may
 * inherit from. Deliberately excludes registration numbers, tax IDs, banking
 * data, and any other statutory identifier — those belong to country-pack
 * compliance settings, a later slice.
 */
export interface GeneralCompanySettingsPayload {
  displayName: string;
  legalName?: string;
  timeZone: string;
  locale: string;
  currency: string;
  firstDayOfWeek: DayOfWeek;
  workingDays: DayOfWeek[];
  dateFormat: DateFormat;
  timeFormat: TimeFormat;
  companyCode: string;
  primaryCountryCode?: string;
}

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

function isValidLocale(value: string): boolean {
  try {
    return Intl.getCanonicalLocales(value).length > 0;
  } catch {
    return false;
  }
}

const SUPPORTED_CURRENCIES: ReadonlySet<string> = new Set(
  typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("currency") : [],
);

function isValidCurrency(value: string): boolean {
  // Intl.NumberFormat's constructor only validates the *shape* of a currency
  // code (3 letters) — it does not throw for a well-formed but nonexistent
  // code like "ZZZ", so "unsupported currency is rejected" requires checking
  // membership against the real ISO 4217 list via Intl.supportedValuesOf.
  if (!/^[A-Z]{3}$/.test(value)) return false;
  return SUPPORTED_CURRENCIES.has(value);
}

function isValidCountryCode(value: string): boolean {
  return /^[A-Z]{2}$/.test(value);
}

const COMPANY_CODE_PATTERN = /^[A-Z0-9][A-Z0-9-]{1,9}$/;

/** Untrusted shape from a form or command — enum-like fields arrive as plain strings until validated. */
export interface GeneralCompanySettingsRawInput {
  displayName?: string;
  legalName?: string;
  timeZone?: string;
  locale?: string;
  currency?: string;
  firstDayOfWeek?: string;
  workingDays?: readonly string[];
  dateFormat?: string;
  timeFormat?: string;
  companyCode?: string;
  primaryCountryCode?: string;
}

/**
 * Server-authoritative validation. Client-side checks may mirror this for
 * usability, but this is what actually decides whether a draft can publish.
 */
export function validateGeneralCompanySettings(input: GeneralCompanySettingsRawInput): ValidationResult<GeneralCompanySettingsPayload> {
  const issues = [];

  if (!input.displayName?.trim()) issues.push(issue("displayName", "REQUIRED", "Enter the name your team will see across AURA."));
  if (input.legalName !== undefined && !input.legalName.trim()) issues.push(issue("legalName", "EMPTY", "Remove this field instead of leaving it blank, or provide your registered legal name."));

  if (!input.timeZone?.trim()) issues.push(issue("timeZone", "REQUIRED", "Choose the time zone your organization operates in."));
  else if (!isValidTimeZone(input.timeZone)) issues.push(issue("timeZone", "UNSUPPORTED", `"${input.timeZone}" is not a recognized time zone.`));

  if (!input.locale?.trim()) issues.push(issue("locale", "REQUIRED", "Choose a default language and region for dates, numbers, and names."));
  else if (!isValidLocale(input.locale)) issues.push(issue("locale", "UNSUPPORTED", `"${input.locale}" is not a recognized locale.`));

  if (!input.currency?.trim()) issues.push(issue("currency", "REQUIRED", "Choose the default currency used across AURA."));
  else if (!isValidCurrency(input.currency)) issues.push(issue("currency", "UNSUPPORTED", `"${input.currency}" is not a recognized ISO currency code.`));

  if (!input.firstDayOfWeek) issues.push(issue("firstDayOfWeek", "REQUIRED", "Choose which day your work week starts on."));
  else if (!(DAYS_OF_WEEK as readonly string[]).includes(input.firstDayOfWeek)) issues.push(issue("firstDayOfWeek", "UNSUPPORTED", `"${input.firstDayOfWeek}" is not a day of the week.`));

  if (!input.workingDays || input.workingDays.length === 0) issues.push(issue("workingDays", "REQUIRED", "Select at least one working day."));
  else {
    const invalidDays = input.workingDays.filter((day) => !(DAYS_OF_WEEK as readonly string[]).includes(day));
    if (invalidDays.length > 0) issues.push(issue("workingDays", "UNSUPPORTED", `${invalidDays.join(", ")} ${invalidDays.length === 1 ? "is" : "are"} not a day of the week.`));
  }

  if (!input.dateFormat) issues.push(issue("dateFormat", "REQUIRED", "Choose how dates should be displayed."));
  else if (!(DATE_FORMATS as readonly string[]).includes(input.dateFormat)) issues.push(issue("dateFormat", "UNSUPPORTED", `"${input.dateFormat}" is not a supported date format.`));

  if (!input.timeFormat) issues.push(issue("timeFormat", "REQUIRED", "Choose 12-hour or 24-hour time."));
  else if (!(TIME_FORMATS as readonly string[]).includes(input.timeFormat)) issues.push(issue("timeFormat", "UNSUPPORTED", `"${input.timeFormat}" is not a supported time format.`));

  if (!input.companyCode?.trim()) issues.push(issue("companyCode", "REQUIRED", "Choose a short internal code for your company (letters and numbers, 2-10 characters)."));
  else if (!COMPANY_CODE_PATTERN.test(input.companyCode.trim().toUpperCase())) issues.push(issue("companyCode", "INVALID_FORMAT", "Company code must be 2-10 letters/numbers, starting with a letter or number."));

  if (input.primaryCountryCode !== undefined && input.primaryCountryCode !== "" && !isValidCountryCode(input.primaryCountryCode)) {
    issues.push(issue("primaryCountryCode", "UNSUPPORTED", `"${input.primaryCountryCode}" is not a valid two-letter country code.`));
  }

  if (issues.length > 0) return invalid(issues);

  return valid({
    displayName: input.displayName!.trim(),
    ...(input.legalName?.trim() ? { legalName: input.legalName.trim() } : {}),
    timeZone: input.timeZone!,
    locale: input.locale!,
    currency: input.currency!,
    firstDayOfWeek: input.firstDayOfWeek! as DayOfWeek,
    workingDays: [...input.workingDays!] as DayOfWeek[],
    dateFormat: input.dateFormat! as DateFormat,
    timeFormat: input.timeFormat! as TimeFormat,
    companyCode: input.companyCode!.trim().toUpperCase(),
    ...(input.primaryCountryCode ? { primaryCountryCode: input.primaryCountryCode } : {}),
  });
}

export interface ConfigurationWarning {
  path: string[];
  code: string;
  message: string;
}

/**
 * Non-blocking guidance, separate from validateGeneralCompanySettings's
 * blocking errors. Warnings never prevent publishing.
 */
export function warnGeneralCompanySettings(input: GeneralCompanySettingsPayload): ConfigurationWarning[] {
  const warnings: ConfigurationWarning[] = [];

  if (input.primaryCountryCode) {
    const zoneCountryHint = input.timeZone.split("/")[0];
    const looksMismatched = zoneCountryHint !== "Etc" && !input.timeZone.toLowerCase().includes(input.primaryCountryCode.toLowerCase());
    if (looksMismatched) {
      warnings.push({ path: ["timeZone"], code: "COUNTRY_TIMEZONE_MISMATCH", message: "The selected time zone may not match your organization's primary country. Double-check this is intentional." });
    }
  }

  if (input.workingDays.length >= 7) {
    warnings.push({ path: ["workingDays"], code: "ALL_DAYS_WORKING", message: "Every day of the week is marked as a working day. Confirm this is intentional." });
  }

  return warnings;
}

const DAY_LABELS: Record<DayOfWeek, string> = {
  SUNDAY: "Sunday", MONDAY: "Monday", TUESDAY: "Tuesday", WEDNESDAY: "Wednesday", THURSDAY: "Thursday", FRIDAY: "Friday", SATURDAY: "Saturday",
};

export interface GeneralCompanySettingsSummaryField {
  label: string;
  value: string;
}

/** Plain-language field summary shared by the view, review, and version-detail screens. */
export function summarizeGeneralCompanySettings(payload: GeneralCompanySettingsPayload): GeneralCompanySettingsSummaryField[] {
  const fields: GeneralCompanySettingsSummaryField[] = [
    { label: "Display name", value: payload.displayName },
  ];
  if (payload.legalName) fields.push({ label: "Legal / registered name", value: payload.legalName });
  fields.push(
    { label: "Time zone", value: payload.timeZone },
    { label: "Locale", value: payload.locale },
    { label: "Currency", value: payload.currency },
    { label: "First day of week", value: DAY_LABELS[payload.firstDayOfWeek] },
    { label: "Working days", value: payload.workingDays.map((day) => DAY_LABELS[day]).join(", ") },
    { label: "Date format", value: payload.dateFormat },
    { label: "Time format", value: payload.timeFormat === "24H" ? "24-hour" : "12-hour" },
    { label: "Company code", value: payload.companyCode },
  );
  if (payload.primaryCountryCode) fields.push({ label: "Primary country", value: payload.primaryCountryCode });
  return fields;
}
