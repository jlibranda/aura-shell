import { hasPermission } from "@/platform/context";
import { commandAuthorizationFailure, commandConflict, commandSuccess, commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import { issue } from "@/platform/validation";
import { createTenantContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { UnitOfWork, UnitOfWorkContext } from "@/platform/transactions/unit-of-work";
import type { LegalEntityTransactionRepositories } from "@/platform/organization/legal-entity-repository";
import { validateCreateLegalEntityDraft, validateUpdateLegalEntityDetails, type LegalEntityRecord } from "@/platform/organization/legal-entity";

export type LegalEntityCreated = Readonly<{ state: "created"; legalEntity: LegalEntityRecord }>;
export type LegalEntityUpdated = Readonly<{ state: "updated"; legalEntity: LegalEntityRecord }>;
export type LegalEntityArchived = Readonly<{ state: "archived"; legalEntity: LegalEntityRecord }>;

/**
 * The single write entry point for legal entities. It owns the invariant that
 * must be enforced against live data *inside the write transaction* — unique
 * code per tenant — and produces audit and outbox atomically through the
 * UnitOfWork. Every mutation requires organization.manage; tenant identity
 * comes only from the trusted request.
 */
export class LegalEntityService {
  constructor(private readonly unitOfWork: UnitOfWork<LegalEntityTransactionRepositories>) {}

  async createLegalEntity(
    request: TrustedRequestContext,
    input: { code: string; legalName: string; countryCode: string },
  ): Promise<CommandResult<LegalEntityCreated>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateCreateLegalEntityDraft(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "CreateLegalEntity"), async ({ repositories }) => {
      if (await repositories.legalEntities.findByCode(tenantId, validation.data.code)) return "code_taken" as const;
      return repositories.legalEntities.create({
        tenantId,
        code: validation.data.code,
        legalName: validation.data.legalName,
        countryCode: validation.data.countryCode,
        createdBy: request.principal.userId,
      });
    });

    if (result === "code_taken") return commandConflict(`A legal entity with code "${validation.data.code}" already exists.`);
    return commandSuccess(Object.freeze({ state: "created" as const, legalEntity: result }));
  }

  async updateLegalEntityDetails(
    request: TrustedRequestContext,
    input: { id: string; legalName: string; countryCode: string },
  ): Promise<CommandResult<LegalEntityUpdated>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateUpdateLegalEntityDetails(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "UpdateLegalEntityDetails"), async ({ repositories }) => {
      if (!(await repositories.legalEntities.findById(tenantId, input.id))) return "not_found" as const;
      return repositories.legalEntities.updateDetails({
        tenantId,
        id: input.id,
        legalName: validation.data.legalName,
        countryCode: validation.data.countryCode,
      });
    });

    if (result === "not_found") return commandValidationFailure([issue("id", "not_found", "This legal entity no longer exists.")]);
    return commandSuccess(Object.freeze({ state: "updated" as const, legalEntity: result }));
  }

  async archiveLegalEntity(request: TrustedRequestContext, input: { id: string }): Promise<CommandResult<LegalEntityArchived>> {
    const denied = this.requireManage(request);
    if (denied) return denied;

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "ArchiveLegalEntity"), async ({ repositories }) => {
      const existing = await repositories.legalEntities.findById(tenantId, input.id);
      if (!existing) return "not_found" as const;
      if (existing.status === "ARCHIVED") return "already_archived" as const;
      return repositories.legalEntities.archive(tenantId, input.id);
    });

    if (result === "not_found") return commandValidationFailure([issue("id", "not_found", "This legal entity no longer exists.")]);
    if (result === "already_archived") return commandConflict("This legal entity is already archived.");
    return commandSuccess(Object.freeze({ state: "archived" as const, legalEntity: result }));
  }

  private requireManage(request: TrustedRequestContext): CommandResult<never> | undefined {
    return hasPermission(createTenantContext(request), "organization.manage")
      ? undefined
      : commandAuthorizationFailure("You are not authorized to manage legal entities.");
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
