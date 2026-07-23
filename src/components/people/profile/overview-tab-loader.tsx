"use client";

import { OverviewTab } from "@/components/people/profile/overview-tab";
import { ProfileNotFound } from "@/components/people/profile/profile-not-found";
import { useEmployee } from "@/lib/people/people-repository";

/**
 * Resolves the employee for the Overview tab from the session repository.
 * Kept separate from the shell so each tab route owns its own data read.
 */
export function OverviewTabLoader({ employeeId }: { employeeId: string }) {
  const employee = useEmployee(employeeId);
  if (!employee) return <ProfileNotFound employeeId={employeeId} />;
  return <OverviewTab employee={employee} />;
}