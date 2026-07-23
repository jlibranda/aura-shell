import { describe, expect, it } from "vitest";
import { DEVELOPMENT_PEOPLE_TENANT_ID, createDevelopmentPeopleFixtures } from "@/platform/people/persistence/development-people-fixtures";

describe("development People fixture projection", () => {
  it("projects the approved synthetic directory/profile fixture set without restricted data", () => {
    const fixtures = createDevelopmentPeopleFixtures();
    expect(DEVELOPMENT_PEOPLE_TENANT_ID).toBe("nw-ph");
    expect(fixtures).toHaveLength(48);
    expect(fixtures.find((fixture) => fixture.employeeId === "emp-2001")).toMatchObject({ employeeNumber: "NW-2001", displayName: "Ana Domingo", workEmail: "ana.domingo@northwind.ph" });
    const fixtureKeys = Object.keys(fixtures[0] ?? {}).map((key) => key.toLowerCase());
    for (const forbidden of ["governmentids", "sss", "philhealth", "pagibig", "tin", "compensation", "bank", "tax", "emergency", "address", "mobile", "phone", "personalemail"]) {
      expect(fixtureKeys).not.toContain(forbidden);
    }
  });
});
