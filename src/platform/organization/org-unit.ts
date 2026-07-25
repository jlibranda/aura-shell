import { invalid, issue, valid, type ValidationResult } from "@/platform/validation";

/**
 * OrgUnit — the single, recursive, typed organizational node (ADR-012 §5).
 * One aggregate differentiated by `kind`; there is never a table or type per
 * level. The hierarchy is a strict single-parent tree (ADR-012 §6): `parentId`
 * is null for a root and otherwise names exactly one parent in the same tenant.
 */

export const ORG_UNIT_KINDS = ["DIVISION", "BUSINESS_UNIT", "DEPARTMENT", "BRANCH", "TEAM"] as const;
export type OrgUnitKind = (typeof ORG_UNIT_KINDS)[number];

export const ORG_UNIT_STATUSES = ["ACTIVE", "ARCHIVED"] as const;
export type OrgUnitStatus = (typeof ORG_UNIT_STATUSES)[number];

/** Immutable read record of one org unit. `id` and `code` are stable identity — never changed, never reused (ADR-012 §12). */
export interface OrgUnitRecord {
  id: string;
  tenantId: string;
  /** The Legal Entity this unit belongs to (ADR-013 §3) — ownership, not an optional attribute. Immutable in this slice; a unit is never moved across Legal Entities. */
  legalEntityId: string;
  code: string;
  name: string;
  kind: OrgUnitKind;
  parentId?: string;
  status: OrgUnitStatus;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
}

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,49}$/;

export interface CreateOrgUnitDraft {
  legalEntityId: string;
  code: string;
  name: string;
  kind: string;
  parentId?: string;
}

/**
 * Server-authoritative validation for a new org unit's own fields. The code is
 * normalized (trimmed + upper-cased) so "FIN" and "fin" can never become two
 * distinct units. Structural invariants (parent existence, cycles, and the
 * parent belonging to the same Legal Entity — ADR-013 §3) are enforced by the
 * write service against live data, not here.
 */
export function validateCreateOrgUnitDraft(input: CreateOrgUnitDraft): ValidationResult<CreateOrgUnitDraft & { kind: OrgUnitKind }> {
  const issues = [];
  if (!input.legalEntityId?.trim()) issues.push(issue("legalEntityId", "REQUIRED", "A legal entity is required."));
  const normalizedCode = input.code?.trim().toUpperCase() ?? "";
  if (!normalizedCode) issues.push(issue("code", "REQUIRED", "A short, stable code is required."));
  else if (!CODE_PATTERN.test(normalizedCode)) issues.push(issue("code", "INVALID_FORMAT", "Code must be 1-50 characters: letters, numbers, dot, dash, or underscore, starting with a letter or number."));
  if (!input.name?.trim()) issues.push(issue("name", "REQUIRED", "A name is required."));
  if (!input.kind) issues.push(issue("kind", "REQUIRED", "An organization unit kind is required."));
  else if (!(ORG_UNIT_KINDS as readonly string[]).includes(input.kind)) issues.push(issue("kind", "UNSUPPORTED", `"${input.kind}" is not a supported org unit kind.`));
  return issues.length ? invalid(issues) : valid({ ...input, legalEntityId: input.legalEntityId.trim(), code: normalizedCode, name: input.name.trim(), kind: input.kind as OrgUnitKind });
}

export function validateOrgUnitName(name: string): ValidationResult<string> {
  return name?.trim() ? valid(name.trim()) : invalid([issue("name", "REQUIRED", "A name is required.")]);
}

/* -------------------------------------------------------------------------- */
/* Pure hierarchy helpers — adjacency in, structure out. No I/O.              */
/* -------------------------------------------------------------------------- */

export interface OrgUnitTreeNode extends OrgUnitRecord {
  children: OrgUnitTreeNode[];
}

/**
 * Builds the single-parent tree from a flat, tenant-scoped adjacency list.
 * Roots are units with no parent (or whose parent is absent from the set).
 * Children are ordered by name then code for a deterministic display order.
 */
export function buildOrgUnitTree(units: readonly OrgUnitRecord[]): OrgUnitTreeNode[] {
  const nodes = new Map<string, OrgUnitTreeNode>();
  for (const unit of units) nodes.set(unit.id, { ...unit, children: [] });
  const roots: OrgUnitTreeNode[] = [];
  for (const node of nodes.values()) {
    const parent = node.parentId ? nodes.get(node.parentId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const sort = (list: OrgUnitTreeNode[]) => {
    list.sort((a, b) => a.name.localeCompare(b.name) || a.code.localeCompare(b.code));
    for (const child of list) sort(child.children);
  };
  sort(roots);
  return roots;
}

/** The set of ids strictly below `rootId` in the adjacency list (its descendants, not itself). */
export function collectDescendantIds(units: readonly OrgUnitRecord[], rootId: string): Set<string> {
  const childrenByParent = new Map<string, string[]>();
  for (const unit of units) {
    if (!unit.parentId) continue;
    const list = childrenByParent.get(unit.parentId) ?? [];
    list.push(unit.id);
    childrenByParent.set(unit.parentId, list);
  }
  const descendants = new Set<string>();
  const stack = [...(childrenByParent.get(rootId) ?? [])];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (descendants.has(id)) continue; // defensive against a pre-existing cycle in stored data
    descendants.add(id);
    for (const child of childrenByParent.get(id) ?? []) stack.push(child);
  }
  return descendants;
}

/**
 * Would setting `unitId`'s parent to `newParentId` create a cycle? True if the
 * new parent is the unit itself or any of its current descendants. This is the
 * single-parent-tree invariant (ADR-012 §6, §12) checked against the live tree.
 */
export function wouldCreateCycle(units: readonly OrgUnitRecord[], unitId: string, newParentId: string): boolean {
  if (unitId === newParentId) return true;
  return collectDescendantIds(units, unitId).has(newParentId);
}
