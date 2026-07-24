import type { Permission } from "@/platform/context";
import { GENERAL_COMPANY_SETTINGS_CODE, GENERAL_COMPANY_SETTINGS_TYPE } from "@/platform/configuration/general-company-settings";

/**
 * ADR-011 Layer 1 — the Static Configuration Manifest.
 *
 * This is the single, code-owned source of truth describing every Settings
 * category the current software build provides. It is intentionally pure
 * data: no tenant persistence, no runtime state, no behavior. Per-tenant
 * status is Layer 2 and is derived elsewhere (configuration-registry-service).
 *
 * Adding a category is adding an entry here — nothing else in the Settings
 * surface needs editing. See docs/architecture/configuration-registry.md.
 */

/** Where a category sits in the Settings information architecture. */
export const NAVIGATION_GROUPS = ["company", "workforce", "governance"] as const;
export type NavigationGroup = (typeof NAVIGATION_GROUPS)[number];

/**
 * A category's build-time implementation status.
 * - "implemented": functional this build (has a route).
 * - "coming_soon": declared but not yet built.
 */
export type ImplementationStatus = "implemented" | "coming_soon";

/**
 * One canonical description of a Settings category. Everything here is
 * identical across tenants and versioned with the code.
 */
export interface ConfigurationCategoryManifestEntry {
  /** Stable identifier. Never reused, never changed once shipped. */
  readonly key: string;
  /** Human-facing name. */
  readonly title: string;
  /** Plain-language purpose, understandable to a non-technical HR/payroll admin. */
  readonly description: string;
  /** Information-architecture group. */
  readonly group: NavigationGroup;
  /** Deterministic ordering within the group (ascending). Unique per group. */
  readonly order: number;
  /** The permission that gates viewing this category. */
  readonly permission: Permission;
  /** The team/platform area accountable for the category. */
  readonly owner: string;
  /** Build-time status. */
  readonly status: ImplementationStatus;
  /**
   * The configuration type this category edits, when it is a versioned
   * configuration category. Absent for functional-but-non-configuration
   * surfaces (e.g. the audit trail) and for coming-soon entries.
   */
  readonly configurationType?: string;
  /** The route, present only for implemented categories. */
  readonly route?: string;
  /**
   * Advisory-only: categories this one is understood to build on. NEVER
   * enforced or resolved (ADR-011 §7) — human documentation, may lag reality.
   */
  readonly dependencies: readonly string[];
  /**
   * Advisory-only: categories/modules understood to consume this one. NEVER
   * treated as an enforced dependency (ADR-011 §7).
   */
  readonly consumers: readonly string[];
}

/**
 * The canonical manifest. Order of declaration is not significant — display
 * order is (group, order). Validated by validateConfigurationManifest().
 */
export const CONFIGURATION_MANIFEST: readonly ConfigurationCategoryManifestEntry[] = Object.freeze([
  {
    key: "general",
    title: "General",
    description: "Company name, time zone, locale, currency, and the working-week defaults other policies build on.",
    group: "company",
    order: 10,
    permission: "settings.view",
    owner: "Platform / Configuration",
    status: "implemented",
    configurationType: GENERAL_COMPANY_SETTINGS_TYPE,
    route: "/settings/general",
    dependencies: [],
    consumers: ["organization", "timekeeping", "payroll"],
  },
  {
    key: "organization",
    title: "Organization",
    description: "Legal entities, departments, and reporting structure.",
    group: "company",
    order: 20,
    permission: "settings.view",
    owner: "Platform / Organization",
    status: "coming_soon",
    dependencies: ["general"],
    consumers: ["timekeeping", "payroll"],
  },
  {
    key: "access_control",
    title: "Access Control",
    description: "Roles, permissions, and who can see or change what.",
    group: "governance",
    order: 10,
    permission: "settings.view",
    owner: "Platform / Security",
    status: "coming_soon",
    dependencies: [],
    consumers: [],
  },
  {
    key: "timekeeping",
    title: "Timekeeping",
    description: "Shift rules, attendance, and time-off policies. Full policy catalog arrives in a later slice.",
    group: "workforce",
    order: 10,
    permission: "settings.view",
    owner: "Platform / Timekeeping",
    status: "coming_soon",
    dependencies: ["general", "organization"],
    consumers: ["payroll"],
  },
  {
    key: "payroll",
    title: "Payroll",
    description: "Pay schedules, statutory rules, and compensation policies. Full policy catalog arrives in a later slice.",
    group: "workforce",
    order: 20,
    permission: "settings.view",
    owner: "Platform / Payroll",
    status: "coming_soon",
    dependencies: ["general", "organization", "timekeeping"],
    consumers: [],
  },
  {
    key: "audit",
    title: "Audit and Diagnostics",
    description: "Who changed what, and when — across every settings category.",
    group: "governance",
    order: 20,
    permission: "settings.audit.view",
    owner: "Platform / Configuration",
    status: "implemented",
    route: "/settings/audit",
    dependencies: [],
    consumers: [],
  },
]);

/** The definition code for a configuration category, mirroring the resolver's type→code mapping. */
export const CONFIGURATION_TYPE_TO_CODE: Readonly<Record<string, string>> = Object.freeze({
  [GENERAL_COMPANY_SETTINGS_TYPE]: GENERAL_COMPANY_SETTINGS_CODE,
});
