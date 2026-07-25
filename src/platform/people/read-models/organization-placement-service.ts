import type { TenantContext } from "@/platform/context";
import type { OrganizationReferenceOptionDto, OrganizationReferenceType, OrganizationSummaryDto } from "@/platform/organization/organization-reference-dtos";

/**
 * People-facing integration over the Organization domain (Epic 7B.4). This
 * replaces the retired `organization-reference-*` placeholder: resolution is
 * keyed by `personId` and always goes through that person's Assignment —
 * never a denormalized Employee field (ADR-012 §12).
 *
 * This is where an Organization id becomes a display name. The Organization
 * domain itself (`OrganizationQueryService`) knows nothing about Employee
 * display names by design; this service is the one place that composes the
 * two for UI consumption.
 */
export interface OrganizationPlacementService {
  /** Department/team/manager display references for one person's current Assignment. Empty fields when the person has no current assignment yet. */
  resolvePlacementSummary(context: TenantContext, personId: string): Promise<OrganizationSummaryDto>;
  /** Batched form of resolvePlacementSummary — one result per input id, same order. */
  resolvePlacementSummaries(context: TenantContext, personIds: readonly string[]): Promise<OrganizationSummaryDto[]>;
  /** Picker options: OrgUnits of kind DEPARTMENT/TEAM, or every employee as a manager candidate. */
  listOptions(context: TenantContext, type: OrganizationReferenceType): Promise<OrganizationReferenceOptionDto[]>;
}
