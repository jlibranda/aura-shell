import { describe, expect, it } from "vitest";
import {
  getRuntimeProfileTabHref,
  RUNTIME_PROFILE_TABS,
} from "@/components/people/profile/profile-nav";

describe("runtime profile tabs", () => {
  it("exposes the four runtime-backed read-only tabs", () => {
    expect(RUNTIME_PROFILE_TABS.filter((tab) => !tab.deferred).map(({ key, label, segment }) => ({ key, label, segment }))).toEqual([
      { key: "overview", label: "Overview", segment: null },
      { key: "employment", label: "Employment", segment: "employment" },
      { key: "work-information", label: "Work Information", segment: "work-information" },
      { key: "contact-information", label: "Contact Information", segment: "contact-information" },
    ]);
  });

  it("keeps deferred tabs visible and routable through their runtime destinations", () => {
    const deferred = RUNTIME_PROFILE_TABS.filter((tab) => tab.deferred);
    expect(deferred.map((tab) => tab.label)).toEqual([
      "Compensation", "Government IDs", "Documents", "Timeline", "Notes", "Emergency Contacts", "Assets",
    ]);
    expect(deferred.map((tab) => getRuntimeProfileTabHref("emp-1", tab))).toEqual([
      "/people/emp-1/compensation",
      "/people/emp-1/government-ids",
      "/people/emp-1/documents",
      "/people/emp-1/timeline",
      "/people/emp-1/notes",
      "/people/emp-1/emergency-contacts",
      "/people/emp-1/assets",
    ]);
  });

  it("preserves the complete, non-truncated deferred tab labels", () => {
    expect(RUNTIME_PROFILE_TABS.find((tab) => tab.key === "government-ids")).toMatchObject({
      label: "Government IDs",
      deferred: true,
    });
  });
});
