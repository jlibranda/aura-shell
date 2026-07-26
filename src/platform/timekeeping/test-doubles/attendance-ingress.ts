import type { TrustedRequestContext } from "@/platform/runtime-context";
import type { AttendanceIngress } from "@/platform/timekeeping/attendance-ingress";
import type {
  AttendanceIngestionService,
  RecordAttendanceEventResult,
  RecordOwnAttendanceEventInput,
} from "@/platform/timekeeping/attendance-ingestion-service";
import type { AttendanceEventSource, AttendanceEventType } from "@/platform/timekeeping/attendance-event";

/**
 * Test-only, deliberately generic AttendanceIngress implementation. It is
 * not modeled on any real channel (no biometric/QR/kiosk-specific fields) —
 * its only purpose is to prove the AttendanceIngress -> AttendanceIngestionService
 * wiring works end-to-end: normalize a payload, acquire the idempotency
 * key already present on it, convert to the service's input shape, and
 * call the correct entry point. Real per-channel adapters are Phase B.
 */
export type GenericIngressPayload = Readonly<
  RecordOwnAttendanceEventInput & {
    personId?: string;
    source: AttendanceEventSource;
    eventType?: AttendanceEventType;
  }
>;

export class GenericAttendanceIngress implements AttendanceIngress<GenericIngressPayload> {
  constructor(private readonly service: AttendanceIngestionService) {}

  async submit(request: TrustedRequestContext, payload: GenericIngressPayload): Promise<RecordAttendanceEventResult> {
    const { personId, ...rest } = payload;
    return personId
      ? this.service.recordAttendanceEventForPerson(request, { ...rest, personId })
      : this.service.recordOwnAttendanceEvent(request, rest);
  }
}
