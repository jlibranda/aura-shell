import { describe, expect, it } from "vitest";
import { RUNTIME_DIRECTORY_ROW_ACTIONS } from "@/components/people/directory/runtime-directory-actions";
import { BUSINESS_CAPABILITIES } from "@/platform/capabilities/business-capabilities";

describe("runtime directory parity actions", () => {
  it("exposes only the safe View Profile row action", () => {
    expect(RUNTIME_DIRECTORY_ROW_ACTIONS).toEqual([
      { key: "view-profile", label: "View profile", permission: "people.read" },
    ]);
  });

  it("registers the restored entry, selection, and deferred bulk capabilities", () => {
    const ids = BUSINESS_CAPABILITIES.map((capability) => capability.id);
    for (const id of ["PEOPLE.EMPLOYEE.HIRE", "PEOPLE.DIRECTORY.BULK.SELECTION", "PEOPLE.DIRECTORY.BULK.CLEAR_SELECTION", "PEOPLE.DIRECTORY.EXPORT"]) {
      expect(ids).toContain(id);
    }
  });

  it("does not register a runtime write action for the bulk toolbar", () => {
    const bulkWrites = BUSINESS_CAPABILITIES.filter((capability) => capability.id.startsWith("PEOPLE.DIRECTORY.BULK.") && capability.access === "write");
    expect(bulkWrites.every((capability) => capability.runtimeStatus !== "ACTIVE_RUNTIME")).toBe(true);
  });
});
