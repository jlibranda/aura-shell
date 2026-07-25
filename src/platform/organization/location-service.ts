import { hasPermission } from "@/platform/context";
import { commandAuthorizationFailure, commandConflict, commandSuccess, commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import { issue } from "@/platform/validation";
import { createTenantContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { UnitOfWork, UnitOfWorkContext } from "@/platform/transactions/unit-of-work";
import type { LocationTransactionRepositories } from "@/platform/organization/location-repository";
import { validateCreateLocationDraft, validateUpdateLocationDetails, type AddressInput, type LocationRecord } from "@/platform/organization/location";

export type LocationCreated = Readonly<{ state: "created"; location: LocationRecord }>;
export type LocationUpdated = Readonly<{ state: "updated"; location: LocationRecord }>;
export type LocationArchived = Readonly<{ state: "archived"; location: LocationRecord }>;

/**
 * The single write entry point for locations. It owns the invariant that must
 * be enforced against live data *inside the write transaction* — unique code
 * per tenant — and produces audit and outbox atomically through the
 * UnitOfWork. Every mutation requires organization.manage; tenant identity
 * comes only from the trusted request.
 */
export class LocationService {
  constructor(private readonly unitOfWork: UnitOfWork<LocationTransactionRepositories>) {}

  async createLocation(
    request: TrustedRequestContext,
    input: { code: string; name: string; address: AddressInput; countryCode: string; timezone: string },
  ): Promise<CommandResult<LocationCreated>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateCreateLocationDraft(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "CreateLocation"), async ({ repositories }) => {
      if (await repositories.locations.findByCode(tenantId, validation.data.code)) return "code_taken" as const;
      return repositories.locations.create({
        tenantId,
        code: validation.data.code,
        name: validation.data.name,
        address: validation.data.address,
        countryCode: validation.data.countryCode,
        timezone: validation.data.timezone,
        createdBy: request.principal.userId,
      });
    });

    if (result === "code_taken") return commandConflict(`A location with code "${validation.data.code}" already exists.`);
    return commandSuccess(Object.freeze({ state: "created" as const, location: result }));
  }

  async updateLocationDetails(
    request: TrustedRequestContext,
    input: { id: string; name: string; address: AddressInput; countryCode: string; timezone: string },
  ): Promise<CommandResult<LocationUpdated>> {
    const denied = this.requireManage(request);
    if (denied) return denied;
    const validation = validateUpdateLocationDetails(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "UpdateLocationDetails"), async ({ repositories }) => {
      if (!(await repositories.locations.findById(tenantId, input.id))) return "not_found" as const;
      return repositories.locations.updateDetails({
        tenantId,
        id: input.id,
        name: validation.data.name,
        address: validation.data.address,
        countryCode: validation.data.countryCode,
        timezone: validation.data.timezone,
      });
    });

    if (result === "not_found") return commandValidationFailure([issue("id", "not_found", "This location no longer exists.")]);
    return commandSuccess(Object.freeze({ state: "updated" as const, location: result }));
  }

  async archiveLocation(request: TrustedRequestContext, input: { id: string }): Promise<CommandResult<LocationArchived>> {
    const denied = this.requireManage(request);
    if (denied) return denied;

    const tenantId = request.principal.tenantId;
    const result = await this.unitOfWork.execute(this.context(request, "ArchiveLocation"), async ({ repositories }) => {
      const existing = await repositories.locations.findById(tenantId, input.id);
      if (!existing) return "not_found" as const;
      if (existing.status === "ARCHIVED") return "already_archived" as const;
      return repositories.locations.archive(tenantId, input.id);
    });

    if (result === "not_found") return commandValidationFailure([issue("id", "not_found", "This location no longer exists.")]);
    if (result === "already_archived") return commandConflict("This location is already archived.");
    return commandSuccess(Object.freeze({ state: "archived" as const, location: result }));
  }

  private requireManage(request: TrustedRequestContext): CommandResult<never> | undefined {
    return hasPermission(createTenantContext(request), "organization.manage")
      ? undefined
      : commandAuthorizationFailure("You are not authorized to manage locations.");
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
