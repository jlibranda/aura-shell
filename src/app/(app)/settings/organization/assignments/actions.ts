"use server";

import { revalidatePath } from "next/cache";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import type { CommandResult } from "@/platform/commands/command-result";
import type { AssignmentAssigned, AssignmentEnded, AssignmentTransferred } from "@/platform/organization/assignment-service";

function revalidateAssignments() {
  revalidatePath("/settings/organization");
  revalidatePath("/settings/organization/assignments");
}

/**
 * A single UI-facing verb over the two existing atomic AssignmentService
 * commands. Whether this becomes `assignPrimary` or `transfer` is decided by
 * reading the person's current placement first (their existing invariant
 * checks, not a new one) — the UI never issues an independent end-then-create
 * pair that could leave an invalid intermediate state.
 *
 * This form has no location field, so the current placement's locationId (if
 * any) is always carried forward unchanged — a Settings-driven transfer must
 * not silently clear an employee's assigned location.
 */
export async function assignOrTransferAction(input: {
  personId: string;
  orgUnitId: string;
  managerId?: string;
  effectiveFrom: string;
}): Promise<CommandResult<AssignmentAssigned | AssignmentTransferred>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const current = await runtime.assignments.read.getCurrentForPerson(runtime.context, input.personId);
  const commandInput = { ...input, locationId: current?.locationId };
  const result = current ? await runtime.assignments.service.transfer(request, commandInput) : await runtime.assignments.service.assignPrimary(request, commandInput);
  if (result.kind === "success") revalidateAssignments();
  return result;
}

export async function endAssignmentAction(input: { personId: string; effectiveUntil: string }): Promise<CommandResult<AssignmentEnded>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const result = await runtime.assignments.service.endAssignment(request, input);
  if (result.kind === "success") revalidateAssignments();
  return result;
}
