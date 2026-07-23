"use client";

import { GovernmentIdsTab } from "@/components/people/profile/government-ids-tab";
import { ProfileNotFound } from "@/components/people/profile/profile-not-found";
import { useEmployee } from "@/lib/people/people-repository";

export function GovernmentIdsTabLoader({ employeeId }: { employeeId: string }) {
  const employee = useEmployee(employeeId);
  if (!employee) return <ProfileNotFound employeeId={employeeId} />;
  return <GovernmentIdsTab employee={employee} />;
}