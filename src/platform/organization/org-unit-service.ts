import { hasPermission } from "@/platform/context";
import { commandAuthorizationFailure, commandConflict, commandSuccess, commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import { issue } from "@/platform/validation";
import { createTenantContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { UnitOfWork, UnitOfWorkContext } from "@/platform/transactions/unit-of-work";
import type { OrgUnitTransactionRepositories } from "@/platform/organization/org-unit-repository";
import { validateCreateOrgUnitDraft, validateOrgUnitName, wouldCreateCycle, type OrgUnitRecord } from "@/platform/organization/org-unit";

export type OrgUnitCreated = Readonly<{ state: "created"; unit: OrgUnitRecord }>;
export type OrgUnitRenamed = Readonly<{ state: "renamed"; unit: OrgUnitRecord }>;
export type OrgUnitMoved = Readonly<{ state: "moved"; unit: OrgUnitRecord }>;
export type OrgUnitArchived = Readonly<{ state: "archived"; unit: OrgUnitRecord }>;

/**
 * The single write entry point for org units. It is genuinely required (not a
 * speculative service): it owns the structural invariants that must be enforced
 * against the live tree *inside the write transaction* — unique code, parent
 * existence, and cycle prevention (ADR-012 §6, §12) — and it produces audit and
 * outbox atomically through the UnitOfWork. Every mutation requires
 * organization.manage; tenant identity comes only from the trusted request.
 */
export class OrgUnitService {
  constructor(private readonly unitOfWork: UnitOfWork<OrgUnitTransactionRepositories>) {}

  async createOrgUnit(request: TrustedRequestContext, input: { legalEntityId: string; code: string; name: string; kind: string; parentId?: string }): Promise<CommandResult<OrgUnitCreated>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateCreateOrgUnitDraft(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "CreateOrgUnit"), async ({ repositories }) => {
      if (await repositories.orgUnits.findByCode(tenantId, validation.data.code)) return "code_taken" as const;
      const legalEntity = await repositories.legalEntities.findById(tenantId, validation.data.legalEntityId);
      if (!legalEntity) return "legal_entity_not_found" as const;
      if (legalEntity.status !== "ACTIVE") return "legal_entity_archived" as const;
      if (input.parentId) {
        const parent = await repositories.orgUnits.findById(tenantId, input.parentId);
        if (!parent) return "parent_not_found" as const;
        if (parent.legalEntityId !== validation.data.legalEntityId) return "cross_entity_parent" as const;
      }
      return repositories.orgUnits.create({
        tenantId,
        legalEntityId: validation.data.legalEntityId,
        code: validation.data.code,
        name: validation.data.name,
        kind: validation.data.kind,
        parentId: input.parentId,
        createdBy: request.principal.userId,
      });
    });

    if (result === "code_taken") return commandConflict(`An org unit with code "${validation.data.code}" already exists.`);
    if (result === "legal_entity_not_found") return commandValidationFailure([issue("legalEntityId", "not_found", "The chosen legal entity does not exist.")]);
    if (result === "legal_entity_archived") return commandValidationFailure([issue("legalEntityId", "archived", "The chosen legal entity is archived and can no longer receive new organization units.")]);
    if (result === "parent_not_found") return commandValidationFailure([issue("parentId", "not_found", "The chosen parent org unit does not exist.")]);
    if (result === "cross_entity_parent") return commandValidationFailure([issue("parentId", "cross_entity", "The chosen parent belongs to a different legal entity. An org unit's parent must belong to the same legal entity.")]);
    return commandSuccess(Object.freeze({ state: "created" as const, unit: result }));
  }

  async renameOrgUnit(request: TrustedRequestContext, input: { id: string; name: string }): Promise<CommandResult<OrgUnitRenamed>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateOrgUnitName(input.name);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "RenameOrgUnit"), async ({ repositories }) => {
      if (!(await repositories.orgUnits.findById(tenantId, input.id))) return "not_found" as const;
      return repositories.orgUnits.rename({ tenantId, id: input.id, name: validation.data });
    });

    if (result === "not_found") return commandValidationFailure([issue("id", "not_found", "This org unit no longer exists.")]);
    return commandSuccess(Object.freeze({ state: "renamed" as const, unit: result }));
  }

  async moveOrgUnit(request: TrustedRequestContext, input: { id: string; parentId: string | null }): Promise<CommandResult<OrgUnitMoved>> {
    const denied = this.requireManage(request);
    if (denied) return denied;

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "MoveOrgUnit"), async ({ repositories }) => {
      const unit = await repositories.orgUnits.findById(tenantId, input.id);
      if (!unit) return "not_found" as const;
      if (input.parentId) {
        const parent = await repositories.orgUnits.findById(tenantId, input.parentId);
        if (!parent) return "parent_not_found" as const;
        if (parent.legalEntityId !== unit.legalEntityId) return "cross_entity_parent" as const;
        const all = await repositories.orgUnits.listAll(tenantId);
        if (wouldCreateCycle(all, input.id, input.parentId)) return "cycle" as const;
      }
      return repositories.orgUnits.move({ tenantId, id: input.id, parentId: input.parentId });
    });

    if (result === "not_found") return commandValidationFailure([issue("id", "not_found", "This org unit no longer exists.")]);
    if (result === "parent_not_found") return commandValidationFailure([issue("parentId", "not_found", "The chosen parent org unit does not exist.")]);
    if (result === "cross_entity_parent") return commandValidationFailure([issue("parentId", "cross_entity", "The chosen parent belongs to a different legal entity. An org unit cannot be moved across legal entities.")]);
    if (result === "cycle") return commandConflict("An org unit cannot be moved beneath itself or one of its descendants.");
    return commandSuccess(Object.freeze({ state: "moved" as const, unit: result }));
  }

  async archiveOrgUnit(request: TrustedRequestContext, input: { id: string }): Promise<CommandResult<OrgUnitArchived>> {
    const denied = this.requireManage(request);
    if (denied) return denied;

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "ArchiveOrgUnit"), async ({ repositories }) => {
      if (!(await repositories.orgUnits.findById(tenantId, input.id))) return "not_found" as const;
      return repositories.orgUnits.archive(tenantId, input.id);
    });

    if (result === "not_found") return commandValidationFailure([issue("id", "not_found", "This org unit no longer exists.")]);
    return commandSuccess(Object.freeze({ state: "archived" as const, unit: result }));
  }

  private requireManage(request: TrustedRequestContext): CommandResult<never> | undefined {
    return hasPermission(createTenantContext(request), "organization.manage")
      ? undefined
      : commandAuthorizationFailure("You are not authorized to manage the organization structure.");
  }

  private context(request: TrustedRequestContext, commandName: string): UnitOfWorkContext {
    return {
      tenantId: request.principal.tenantId,
      correlationId: request.correlationId,
      requestId: request.correlationId,
      actorUserId: request.principal.userId,
      commandName,
    };
  }
}
