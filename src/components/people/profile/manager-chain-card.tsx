"use client";

import Link from "next/link";
import { Network, UserRound } from "lucide-react";
import { ProfileSectionCard } from "@/components/people/profile/profile-section-card";
import { ProfileField, ProfileFieldGrid } from "@/components/people/profile/profile-field";
import { usePeopleRepository } from "@/lib/people/people-repository";
import { fullName } from "@/lib/people/directory-query";
import type { Employee } from "@/lib/people/people-types";

function ManagerLink({ employee }: { employee: Employee }) {
  return (
    <Link href={`/people/${employee.id}`} className="text-foreground hover:underline">
      {fullName(employee)}
    </Link>
  );
}

/**
 * Reporting field summary: direct manager, skip-level manager, and the assigned
 * HR business partner (derived from the People Ops team lead).
 */
export function ManagerChainCard({ employee }: { employee: Employee }) {
  const employees = usePeopleRepository((s) => s.employees);
  const byId = (id?: string) => (id ? employees.find((e) => e.id === id) : undefined);

  const manager = byId(employee.employment.managerId);
  const skipManager = byId(manager?.employment.managerId);

  // HR business partner: the People Ops HRBP, else the People Ops lead.
  const hrbp =
    employees.find(
      (e) =>
        e.employment.departmentId === "dep-people" &&
        e.employment.positionTitle.toLowerCase().includes("business partner"),
    ) ??
    employees.find(
      (e) =>
        e.employment.departmentId === "dep-people" &&
        e.employment.positionTitle.toLowerCase().includes("lead"),
    );

  return (
    <ProfileSectionCard title="Reporting" icon={Network}>
      <ProfileFieldGrid columns={1}>
        <ProfileField
          label="Direct manager"
          value={manager ? <ManagerLink employee={manager} /> : undefined}
          missing={!manager}
        />
        <ProfileField
          label="Skip-level manager"
          value={skipManager ? <ManagerLink employee={skipManager} /> : undefined}
          missing={!skipManager}
        />
        <ProfileField
          label="HR business partner"
          value={hrbp && hrbp.id !== employee.id ? <ManagerLink employee={hrbp} /> : undefined}
          missing={!hrbp || hrbp.id === employee.id}
        />
      </ProfileFieldGrid>
    </ProfileSectionCard>
  );
}