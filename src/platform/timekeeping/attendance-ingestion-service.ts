import { hasPermission, type Permission } from "@/platform/context";
import { commandAuthorizationFailure, commandConflict, commandInfrastructureFailure, commandSuccess, commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import { createTenantContext, type TrustedRequestContext } from "@/platform/runtime-context";
import type { UnitOfWork, UnitOfWorkContext } from "@/platform/transactions/unit-of-work";
import { validateCreateAttendanceEventDraft, type AttendanceEventRecord, type AttendanceEventSource, type AttendanceEventType } from "@/platform/timekeeping/attendance-event";
import type { AttendanceEventTransactionRepositories } from "@/platform/timekeeping/attendance-event-repository";
import type { CurrentPersonResolver } from "@/platform/timekeeping/current-person-resolver";

/**
 * The channel-agnostic contract every AttendanceIngress implementation
 * converts a raw channel payload into (Slice 2 additional requirement).
 * Identical in shape to Slice 1's CreateAttendanceEventInput minus
 * tenantId, which the service derives from the trusted request context
 * rather than accepting from a caller.
 */
export type RecordAttendanceEventInput = Readonly<{
  personId: string;
  occurredAtUtc: string;
  receivedAtUtc: string;
  source: AttendanceEventSource;
  sourceRef?: string;
  eventType?: AttendanceEventType;
  idempotencyKey: string;
}>;

/**
 * The self-clock variant deliberately has no personId field at all — the
 * same "the invariant is enforced by what the type system allows" technique
 * ADR-014 §8 cites from TransferInput (ADR-013 §3): a self-clock caller can
 * never supply someone else's identity, structurally, not by convention.
 */
export type RecordOwnAttendanceEventInput = Readonly<Omit<RecordAttendanceEventInput, "personId">>;

export type RecordAttendanceEventOutcome = Readonly<{ event: AttendanceEventRecord; replayed: boolean }>;
export type RecordAttendanceEventResult = CommandResult<RecordAttendanceEventOutcome>;

/**
 * The single write path for every attendance channel (ADR-014 §8). This
 * service is deliberately channel-agnostic: it never branches on `source`,
 * never contains vendor-specific logic, and never authenticates a caller —
 * it consumes an already-trusted TrustedRequestContext (Slice 2 Decision
 * 4). Callers reach it only through an AttendanceIngress implementation
 * (attendance-ingress.ts), which owns all payload normalization.
 *
 * Two entry points, matching the two permissions ADR-014 §13 already names
 * (Slice 2 Decision 2) — no third permission is introduced:
 * - recordOwnAttendanceEvent: the caller records their own event
 *   (timekeeping.clock). personId is never caller-supplied; it comes only
 *   from CurrentPersonResolver.
 * - recordAttendanceEventForPerson: the caller records another person's
 *   event (timekeeping.manage) — device/import/API/admin channels.
 *
 * All validation and idempotency logic belongs to AttendanceEvent
 * (Slice 1) and is reused here, never duplicated — this service adds only
 * authorization and orchestration.
 */
export class AttendanceIngestionService {
  constructor(
    private readonly unitOfWork: UnitOfWork<AttendanceEventTransactionRepositories>,
    private readonly currentPersonResolver: CurrentPersonResolver,
  ) {}

  async recordOwnAttendanceEvent(request: TrustedRequestContext, input: RecordOwnAttendanceEventInput): Promise<RecordAttendanceEventResult> {
    const denied = this.requirePermission(request, "timekeeping.clock");
    if (denied) return denied;

    const resolution = await this.currentPersonResolver.resolveCurrentPerson(request);
    if (resolution.kind === "unresolved") {
      return commandInfrastructureFailure("Your account is not yet linked to an employee record, so attendance cannot be recorded for you.");
    }

    return this.record(request, "RecordOwnAttendanceEvent", { ...input, personId: resolution.personId });
  }

  async recordAttendanceEventForPerson(request: TrustedRequestContext, input: RecordAttendanceEventInput): Promise<RecordAttendanceEventResult> {
    const denied = this.requirePermission(request, "timekeeping.manage");
    if (denied) return denied;
    return this.record(request, "RecordAttendanceEventForPerson", input);
  }

  private async record(request: TrustedRequestContext, commandName: string, input: RecordAttendanceEventInput): Promise<RecordAttendanceEventResult> {
    const validation = validateCreateAttendanceEventDraft(input);
    if (!validation.success) return commandValidationFailure(validation.issues);

    const tenantId = request.principal.tenantId;
    const outcome = await this.unitOfWork.execute(this.context(request, commandName), ({ repositories }) =>
      repositories.attendanceEvents.create({ tenantId, ...validation.data }),
    );

    if (outcome.kind === "conflict") {
      return commandConflict("An attendance event with this idempotency key already exists with different details.");
    }
    return commandSuccess(Object.freeze({ event: outcome.event, replayed: outcome.kind === "replayed" }));
  }

  private requirePermission(request: TrustedRequestContext, permission: Permission): CommandResult<never> | undefined {
    return hasPermission(createTenantContext(request), permission)
      ? undefined
      : commandAuthorizationFailure("You are not authorized to record attendance events.");
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
