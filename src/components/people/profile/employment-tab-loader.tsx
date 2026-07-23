"use client";

import { EmploymentTab } from "@/components/people/profile/employment-tab";
import { ProfileNotFound } from "@/components/people/profile/profile-not-found";
import { useEmployee } from "@/lib/people/people-repository";

export function EmploymentTabLoader({ employeeId }: { employeeId: string }) {
  const employee = useEmployee(employeeId);
  if (!employee) return <ProfileNotFound employeeId={employeeId} />;
  return <EmploymentTab employee={employee} />;
}