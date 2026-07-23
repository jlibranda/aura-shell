"use client";

import { EmployeeActionsMenu } from "@/components/people/actions/employee-actions-menu";
import { useEmployee } from "@/lib/people/people-repository";

/**
 * Bridges the profile header to the lifecycle Actions menu. Reads the live
 * employee from the repository so the menu reflects the latest status.
 */
export function ProfileActionsSlot({ employeeId }: { employeeId: string }) {
  const employee = useEmployee(employeeId);
  if (!employee) return null;
  return <EmployeeActionsMenu employee={employee} />;
}