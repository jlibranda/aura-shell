import { describe, expect, it } from "vitest";
import { BUSINESS_CAPABILITIES, CAPABILITY_STATUSES, MIGRATION_DISPOSITIONS } from "@/platform/capabilities/business-capabilities";

describe("Business Capability Registry", () => {
  it("has unique IDs, controlled statuses, and exactly one disposition", () => {
    expect(new Set(BUSINESS_CAPABILITIES.map((capability) => capability.id)).size).toBe(BUSINESS_CAPABILITIES.length);
    for (const capability of BUSINESS_CAPABILITIES) {
      expect(CAPABILITY_STATUSES).toContain(capability.runtimeStatus);
      expect(MIGRATION_DISPOSITIONS).toContain(capability.migrationDisposition);
    }
  });

  it("requires permissions and audit events for sensitive reveal, copy, and writes", () => {
    for (const capability of BUSINESS_CAPABILITIES.filter((item) => item.access === "write" || /GOVERNMENT_IDS\.(REVEAL|COPY)/.test(item.id))) {
      expect(capability.permission).toBeTruthy();
      expect(capability.auditEvent).toBeTruthy();
    }
  });

  it("does not document the read permission for Government ID updates", () => {
    expect(BUSINESS_CAPABILITIES.find((item) => item.id === "PEOPLE.GOVERNMENT_IDS.UPDATE")?.permission).toBe("people.government_ids.update");
  });
});
