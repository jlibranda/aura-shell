import { randomUUID } from "node:crypto";
import { hasPermission, type TenantContext } from "@/platform/context";
import { AuthorizationError } from "@/platform/errors";
import type {
  AttendancePolicyReadRepository,
  AttendancePolicyWriteRepository,
  CreateAttendancePolicyInput,
  EndAttendancePolicyRepositoryInput,
} from "@/platform/timekeeping/attendance-policy-repository";
import { isEffectiveAsOf, type AttendancePolicyRecord, type PolicyScope } from "@/platform/timekeeping/attendance-policy";

function requireTimekeepingView(context: TenantContext): void {
  if (!hasPermission(context, "timekeeping.view")) throw new AuthorizationError();
}

/** Shared in-process store so a test can write via one repository and read via the other. */
export class AttendancePolicyStore {
  readonly policies: AttendancePolicyRecord[] = [];
}

export class InMemoryAttendancePolicyWriteRepository implements AttendancePolicyWriteRepository {
  constructor(private readonly store: AttendancePolicyStore = new AttendancePolicyStore()) {}

  async findById(tenantId: string, attendancePolicyVersionId: string): Promise<AttendancePolicyRecord | undefined> {
    return this.store.policies.find((p) => p.tenantId === tenantId && p.attendancePolicyVersionId === attendancePolicyVersionId);
  }

  async listForScope(tenantId: string, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord[]> {
    return this.store.policies
      .filter((p) => p.tenantId === tenantId && p.scope === scope && p.scopeId === scopeId)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }

  async findCurrentForScope(tenantId: string, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord | undefined> {
    return this.store.policies.find((p) => p.tenantId === tenantId && p.scope === scope && p.scopeId === scopeId && !p.effectiveUntil);
  }

  async create(input: CreateAttendancePolicyInput): Promise<AttendancePolicyRecord> {
    const policy: AttendancePolicyRecord = Object.freeze({
      attendancePolicyId: input.attendancePolicyId ?? randomUUID(),
      attendancePolicyVersionId: randomUUID(),
      tenantId: input.tenantId,
      scope: input.scope,
      scopeId: input.scopeId,
      effectiveFrom: input.effectiveFrom,
      rounding: input.rounding,
      gracePeriod: input.gracePeriod,
      breakRules: input.breakRules,
      overtime: input.overtime,
      overtimeThresholdsAreStatutoryFloor: input.overtimeThresholdsAreStatutoryFloor,
      tolerance: input.tolerance,
      calculationAlgorithmVersion: input.calculationAlgorithmVersion,
      fingerprint: input.fingerprint,
      ...(input.changeReason ? { changeReason: input.changeReason } : {}),
      createdAt: new Date().toISOString(),
      createdBy: input.createdBy,
    });
    this.store.policies.push(policy);
    return policy;
  }

  async end(input: EndAttendancePolicyRepositoryInput): Promise<AttendancePolicyRecord> {
    const index = this.store.policies.findIndex((p) => p.tenantId === input.tenantId && p.attendancePolicyVersionId === input.attendancePolicyVersionId);
    if (index === -1) throw new Error(`attendance policy ${input.attendancePolicyVersionId} not found for tenant ${input.tenantId}`);
    const updated: AttendancePolicyRecord = Object.freeze({ ...this.store.policies[index], effectiveUntil: input.effectiveUntil });
    this.store.policies[index] = updated;
    return updated;
  }
}

export class InMemoryAttendancePolicyReadRepository implements AttendancePolicyReadRepository {
  constructor(private readonly store: AttendancePolicyStore) {}

  async findById(context: TenantContext, attendancePolicyVersionId: string): Promise<AttendancePolicyRecord | undefined> {
    requireTimekeepingView(context);
    return this.store.policies.find((p) => p.tenantId === context.tenantId && p.attendancePolicyVersionId === attendancePolicyVersionId);
  }

  async findPolicyAtInstant(context: TenantContext, scope: PolicyScope, scopeId: string, at: string): Promise<AttendancePolicyRecord | undefined> {
    requireTimekeepingView(context);
    const asOf = new Date(at);
    return this.store.policies.find((p) => p.tenantId === context.tenantId && p.scope === scope && p.scopeId === scopeId && isEffectiveAsOf(p, asOf));
  }

  async findCurrentPolicy(context: TenantContext, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord | undefined> {
    requireTimekeepingView(context);
    return this.store.policies.find((p) => p.tenantId === context.tenantId && p.scope === scope && p.scopeId === scopeId && !p.effectiveUntil);
  }

  async listPolicyHistory(context: TenantContext, scope: PolicyScope, scopeId: string): Promise<AttendancePolicyRecord[]> {
    requireTimekeepingView(context);
    return this.store.policies
      .filter((p) => p.tenantId === context.tenantId && p.scope === scope && p.scopeId === scopeId)
      .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
  }
}
