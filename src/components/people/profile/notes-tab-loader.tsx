"use client";

import { NotesTab } from "@/components/people/profile/notes-tab";
import { ProfileNotFound } from "@/components/people/profile/profile-not-found";
import { useEmployee } from "@/lib/people/people-repository";

export function NotesTabLoader({ employeeId }: { employeeId: string }) {
  const employee = useEmployee(employeeId);
  if (!employee) return <ProfileNotFound employeeId={employeeId} />;
  return <NotesTab employee={employee} />;
}