"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Building2, Network, UserCog, Users, Sparkles } from "lucide-react";
import { Tabs, type TabItem } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { OrgOverviewStats } from "@/components/people/org/org-overview-stats";
import { OrgSummaryCard } from "@/components/people/org/org-summary-card";
import { OrgFilters } from "@/components/people/org/org-filters";
import { DepartmentDirectory } from "@/components/people/org/department-directory";
import { TeamDirectory } from "@/components/people/org/team-directory";
import { ManagerDirectory } from "@/components/people/org/manager-directory";
import { usePeopleRepository } from "@/lib/people/people-repository";
import {
  departmentViews,
  teamViews,
  managerViews,
  orgSummary,
  emptyOrgFilter,
  matchesOrgFilter,
  type OrgFilter,
} from "@/lib/people/org-presentation";
import { fullName } from "@/lib/people/directory-query";

type OrgTab = "departments" | "teams" | "managers";

export function OrganizationPage() {
  const employees = usePeopleRepository((s) => s.employees);
  const departments = usePeopleRepository((s) => s.departments);
  const teams = usePeopleRepository((s) => s.teams);

  const [tab, setTab] = useState<OrgTab>("departments");
  const [filter, setFilter] = useState<OrgFilter>(emptyOrgFilter());
  const patch = (p: Partial<OrgFilter>) => setFilter((f) => ({ ...f, ...p }));

  const summary = useMemo(
    () => orgSummary(employees, departments, teams),
    [employees, departments, teams],
  );

  // Employees passing the structured filters (used to scope the directories).
  const filteredEmployees = useMemo(
    () => employees.filter((e) => matchesOrgFilter(e, filter)),
    [employees, filter],
  );
  const allowedIds = useMemo(
    () => new Set(filteredEmployees.map((e) => e.id)),
    [filteredEmployees],
  );

  const q = filter.search.trim().toLowerCase();

  const departmentData = useMemo(() => {
    let views = departmentViews(departments, teams, employees);
    if (filter.departmentId) views = views.filter((d) => d.id === filter.departmentId);
    if (q) views = views.filter((d) => d.name.toLowerCase().includes(q) || (d.head && fullName(d.head).toLowerCase().includes(q)));
    return views;
  }, [departments, teams, employees, filter.departmentId, q]);

  const teamData = useMemo(() => {
    let views = teamViews(teams, departments, employees);
    if (filter.departmentId) views = views.filter((t) => t.departmentId === filter.departmentId);
    if (q)
      views = views.filter(
        (t) =>
          t.name.toLowerCase().includes(q) ||
          t.departmentName.toLowerCase().includes(q) ||
          (t.manager && fullName(t.manager).toLowerCase().includes(q)),
      );
    return views;
  }, [teams, departments, employees, filter.departmentId, q]);

  const managerData = useMemo(() => {
    let views = managerViews(employees, departments);
    views = views.filter((m) => allowedIds.has(m.manager.id) || (!filter.departmentId && !filter.entityId && !filter.managerId && !filter.status && !q));
    if (filter.departmentId)
      views = views.filter((m) => m.manager.employment.departmentId === filter.departmentId);
    if (filter.entityId)
      views = views.filter((m) => m.manager.employment.entityId === filter.entityId);
    if (filter.status) views = views.filter((m) => m.manager.status === filter.status);
    if (q)
      views = views.filter(
        (m) =>
          fullName(m.manager).toLowerCase().includes(q) ||
          m.manager.employment.positionTitle.toLowerCase().includes(q) ||
          m.departmentName.toLowerCase().includes(q),
      );
    return views;
  }, [employees, departments, allowedIds, filter, q]);

  const tabs: TabItem[] = [
    { key: "departments", label: "Departments", icon: Building2, count: departmentData.length },
    { key: "teams", label: "Teams", icon: Network, count: teamData.length },
    { key: "managers", label: "Managers", icon: UserCog, count: managerData.length },
  ];

  return (
    <div className="mx-auto max-w-[92rem]">
      <div className="mb-5 flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-foreground">Organization</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Departments, teams, and the reporting structure across the company.
          </p>
        </div>
        <Button asChild variant="secondary" size="sm">
          <Link href="/people/org/chart">
            <Sparkles className="h-4 w-4" />
            View org chart
          </Link>
        </Button>
      </div>

      <OrgOverviewStats summary={summary} />

      <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-4">
        <div className="space-y-4 lg:col-span-3">
          <OrgFilters filter={filter} onChange={patch} />
          <Tabs items={tabs} value={tab} onChange={(k) => setTab(k as OrgTab)} />
          <div>
            {tab === "departments" ? <DepartmentDirectory views={departmentData} /> : null}
            {tab === "teams" ? <TeamDirectory views={teamData} /> : null}
            {tab === "managers" ? <ManagerDirectory views={managerData} /> : null}
          </div>
        </div>

        <div className="space-y-5">
          <OrgSummaryCard summary={summary} />
        </div>
      </div>
    </div>
  );
}