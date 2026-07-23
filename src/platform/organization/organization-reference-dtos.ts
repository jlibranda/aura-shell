export type OrganizationReferenceType = "department" | "team" | "manager";

/** A verified display reference safe for application UI consumption. */
export interface OrganizationReferenceDto {
  id: string;
  displayName: string;
  type: OrganizationReferenceType;
}

/** A safe selectable reference. parentId is internal selection metadata, never a display label. */
export interface OrganizationReferenceOptionDto extends OrganizationReferenceDto {
  parentId?: string;
}

export interface OrganizationSummaryDto {
  department?: OrganizationReferenceDto;
  team?: OrganizationReferenceDto;
  manager?: OrganizationReferenceDto;
}
