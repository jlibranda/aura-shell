import type { TrustedRequestContext } from "@/platform/runtime-context";
import type { RecordAttendanceEventResult } from "@/platform/timekeeping/attendance-ingestion-service";

/**
 * The channel-facing boundary for Attendance Ingestion (ADR-014 §8; Slice 2
 * additional requirement). Each supported channel — biometric device,
 * import batch, API, web clock, mobile, QR, kiosk, system — gets its own
 * AttendanceIngress implementation, responsible only for:
 * - payload normalization (that channel's raw, source-specific shape),
 * - request validation (envelope-level, before domain validation),
 * - idempotency-key acquisition (constructing or extracting the key that
 *   channel uses),
 * - conversion into a RecordAttendanceEventInput / RecordOwnAttendanceEventInput,
 * then calling AttendanceIngestionService.
 *
 * Channel Rule: AttendanceIngress implementations may vary.
 * AttendanceIngestionService must not. No vendor-specific or
 * source-specific branching may leak past this boundary into the service —
 * `AttendanceIngestionService` never inspects `TPayload` and never knows
 * this interface exists.
 *
 * No production implementation exists yet. Every channel adapter
 * (BiometricDeviceIngress, ImportIngress, ApiIngress, WebClockIngress,
 * MobileIngress, QrIngress, KioskIngress, SystemIngress) is Phase B /
 * device-adapter work, deliberately out of Slice 2 Phase A's scope. A
 * generic test-only implementation exists at
 * test-doubles/attendance-ingress.ts to prove this contract is wireable
 * and testable.
 */
export interface AttendanceIngress<TPayload = unknown> {
  submit(request: TrustedRequestContext, payload: TPayload): Promise<RecordAttendanceEventResult>;
}
