"use server";

import { revalidatePath } from "next/cache";
import { resolveRequestContext } from "@/platform/auth/resolve-request-context";
import { createOrganizationAdminRuntime } from "@/platform/organization/organization-admin-runtime";
import { issue } from "@/platform/validation";
import { commandValidationFailure, type CommandResult } from "@/platform/commands/command-result";
import type { AssignmentAssigned, AssignmentEnded, AssignmentTransferred } from "@/platform/organization/assignment-service";

/**
 * Thin server adapters over the existing AssignmentService for the Employee
 * Profile > Employment tab — no new business logic. `employeeId` is always
 * the caller-supplied argument bound to the profile route being viewed, the
 * same design as Settings' assignOrTransferAction; authorization is not a
 * function of which page rendered the button — organization.manage already
 * grants tenant-wide placement authority (proven by the Settings admin
 * surface), and AssignmentService re-checks it on every call regardless of
 * what the UI shows.
 */

function revalidateEmployment(employeeId: string) {
  revalidatePath(`/people/${employeeId}/employment`);
  revalidatePath(`/people/${employeeId}`);
}

/**
 * Transfer: moves the employee to a (new or first) organization unit,
 * optionally with a new manager. Dispatches to assignPrimary or transfer
 * depending on whether the employee already has a current placement — never
 * an independent end-then-create pair that could leave an invalid state.
 *
 * The Transfer drawer has no location field — a transfer is never supposed
 * to silently clear an employee's assigned location, so the current
 * placement's locationId is always carried forward unchanged. Change
 * Location is the only action that sets a new one.
 */
export async function transferEmployeeAction(input: {
  employeeId: string;
  orgUnitId: string;
  managerId?: string;
  effectiveFrom: string;
}): Promise<CommandResult<AssignmentAssigned | AssignmentTransferred>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const current = await runtime.assignments.read.getCurrentForPerson(runtime.context, input.employeeId);
  const commandInput = { personId: input.employeeId, orgUnitId: input.orgUnitId, managerId: input.managerId, locationId: current?.locationId, effectiveFrom: input.effectiveFrom };
  const result = current
    ? await runtime.assignments.service.transfer(request, commandInput)
    : await runtime.assignments.service.assignPrimary(request, commandInput);
  if (result.kind === "success") revalidateEmployment(input.employeeId);
  return result;
}

/**
 * Change Manager: keeps the employee's current organization unit and
 * location, changes only the manager. Requires an existing current
 * placement — an employee with none has no manager to change; Transfer
 * establishes their first placement instead.
 */
export async function changeManagerAction(input: {
  employeeId: string;
  managerId?: string;
  effectiveFrom: string;
}): Promise<CommandResult<AssignmentTransferred>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const current = await runtime.assignments.read.getCurrentForPerson(runtime.context, input.employeeId);
  if (!current) {
    return commandValidationFailure([
      issue("employeeId", "no_current_assignment", "This employee has no current placement. Transfer them into an organization unit first."),
    ]);
  }
  const result = await runtime.assignments.service.transfer(request, {
    personId: input.employeeId,
    orgUnitId: current.orgUnitId,
    managerId: input.managerId,
    locationId: current.locationId,
    effectiveFrom: input.effectiveFrom,
  });
  if (result.kind === "success") revalidateEmployment(input.employeeId);
  return result;
}

/**
 * Change Location: keeps the employee's current organization unit and
 * manager, changes only the assigned Location. The exact same
 * AssignmentService.transfer command as Transfer Employee and Change
 * Manager — not a separate command — so it inherits the same overlap
 * validation, audit, outbox, and history behavior. Requires an existing
 * current placement, same as Change Manager.
 */
export async function changeLocationAction(input: {
  employeeId: string;
  locationId?: string;
  effectiveFrom: string;
}): Promise<CommandResult<AssignmentTransferred>> {
  if (!input.locationId) {
    return commandValidationFailure([issue("locationId", "required", "A location is required.")]);
  }
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const current = await runtime.assignments.read.getCurrentForPerson(runtime.context, input.employeeId);
  if (!current) {
    return commandValidationFailure([
      issue("employeeId", "no_current_assignment", "This employee has no current placement. Transfer them into an organization unit first."),
    ]);
  }
  const result = await runtime.assignments.service.transfer(request, {
    personId: input.employeeId,
    orgUnitId: current.orgUnitId,
    managerId: current.managerId,
    locationId: input.locationId,
    effectiveFrom: input.effectiveFrom,
  });
  if (result.kind === "success") revalidateEmployment(input.employeeId);
  return result;
}

/** Ends the employee's current placement without opening a new one (e.g. offboarding). */
export async function endPlacementAction(input: { employeeId: string; effectiveUntil: string }): Promise<CommandResult<AssignmentEnded>> {
  const request = await resolveRequestContext();
  const runtime = createOrganizationAdminRuntime(request);
  const result = await runtime.assignments.service.endAssignment(request, { personId: input.employeeId, effectiveUntil: input.effectiveUntil });
  if (result.kind === "success") revalidateEmployment(input.employeeId);
  return result;
}
