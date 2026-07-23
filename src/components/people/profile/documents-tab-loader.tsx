"use client";

import { DocumentsTab } from "@/components/people/profile/documents-tab";
import { ProfileNotFound } from "@/components/people/profile/profile-not-found";
import { useEmployee } from "@/lib/people/people-repository";

export function DocumentsTabLoader({ employeeId }: { employeeId: string }) {
  const employee = useEmployee(employeeId);
  if (!employee) return <ProfileNotFound employeeId={employeeId} />;
  return <DocumentsTab employee={employee} />;
}