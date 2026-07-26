import type { OrganizationAssignmentAsOfPort } from "@/platform/timekeeping/organization-assignment-port";

export interface OrganizationAssignmentWindow {
  personId: string;
  effectiveFrom: string;
  effectiveUntil?: string;
}

/** In-memory stand-in for Organization's Assignment table, for server-side tests and development only. Seed known placement windows with `seed`. */
export class InMemoryOrganizationAssignmentAsOfRepository implements OrganizationAssignmentAsOfPort {
  private readonly windows: ({ tenantId: string } & OrganizationAssignmentWindow)[] = [];

  seed(tenantId: string, window: OrganizationAssignmentWindow): void {
    this.windows.push({ tenantId, ...window });
  }

  async hasApplicableAssignmentAsOf(tenantId: string, personId: string, asOf: string): Promise<boolean> {
    const at = new Date(asOf).getTime();
    return this.windows.some((w) =>
      w.tenantId === tenantId &&
      w.personId === personId &&
      new Date(w.effectiveFrom).getTime() <= at &&
      (!w.effectiveUntil || new Date(w.effectiveUntil).getTime() > at),
    );
  }
}
