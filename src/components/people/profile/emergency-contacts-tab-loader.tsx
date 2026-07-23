"use client";

import { EmergencyContactsTab } from "@/components/people/profile/emergency-contacts-tab";
import { ProfileNotFound } from "@/components/people/profile/profile-not-found";
import { useEmployee } from "@/lib/people/people-repository";

export function EmergencyContactsTabLoader({ employeeId }: { employeeId: string }) {
  const employee = useEmployee(employeeId);
  if (!employee) return <ProfileNotFound employeeId={employeeId} />;
  return <EmergencyContactsTab employee={employee} />;
}