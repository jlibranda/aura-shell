import type {
  ConfigurationCategoryStatus,
  DescribedConfigurationCategory,
} from "@/platform/configuration/registry/configuration-registry-service";

const STATUS_LABEL: Record<ConfigurationCategoryStatus, string> = {
  coming_soon: "Coming soon",
  available: "Available",
  not_configured: "Not set up yet",
  configured: "Configured",
};

const STATUS_TONE: Record<ConfigurationCategoryStatus, "neutral" | "warning" | "success"> = {
  coming_soon: "neutral",
  available: "success",
  not_configured: "neutral",
  configured: "success",
};

export interface SettingsCategoryPresentation {
  statusLabel: string;
  statusTone: "neutral" | "warning" | "success";
  /** Additive notes shown alongside the primary status (draft, scheduled change). */
  annotations: string[];
  /** The link target, present only when the category is an implemented, reachable destination. */
  href?: string;
  /** Whether the card is an interactive link. */
  interactive: boolean;
  /** A single spoken status string for the accessible name. */
  accessibleStatus: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Pure presentation mapping for one described category. Extracted from the card
 * so status/label/annotation logic is unit-testable without a DOM renderer.
 * Holds no category identity of its own — everything derives from the input.
 */
export function presentSettingsCategory(category: DescribedConfigurationCategory): SettingsCategoryPresentation {
  const annotations: string[] = [];
  if (category.hasScheduledChange && category.scheduledFor) annotations.push(`Change scheduled for ${formatDate(category.scheduledFor)}`);
  if (category.hasDraft) annotations.push("Unpublished draft in progress");

  const href = category.implemented ? category.route : undefined;
  return {
    statusLabel: STATUS_LABEL[category.status],
    statusTone: STATUS_TONE[category.status],
    annotations,
    ...(href ? { href } : {}),
    interactive: Boolean(href),
    accessibleStatus: [STATUS_LABEL[category.status], ...annotations].join(". "),
  };
}
