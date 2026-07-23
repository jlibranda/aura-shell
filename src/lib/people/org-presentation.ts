/**
 * Read-only projections for the Organization experience. Derives departments,
 * teams, managers, headcount, and the reporting tree from the existing People
 * repository records. Pure functions — no new stored state, no side effects.
 */
import type {
  Department,
  Employee,
  EmployeeStatus,
  Team,
} from "@/lib/people/people-types";
import { fullName } from "@/lib/people/directory-query";
import { STATUS_META } from "@/lib/people/status-machine";

/** An employee is "active headcount" if their status counts as employed. */
export function isEmployed(employee: Employee): boolean {
  return STATUS_META[employee.status].employed && !employee.offboardedAt;
}

export interface DepartmentView {
  id: string;
  name: string;
  description?: string;
  head: Employee | null;
  employeeCount: number;
  activeCount: number;
  teamCount: number;
  teams: Team[];
}

export function departmentViews(
  departments: Department[],
  teams: Team[],
  employees: Employee[],
): DepartmentView[] {
  return departments
    .map((dept) => {
      const members = employees.filter((e) => e.employment.departmentId === dept.id);
      const deptTeams = teams.filter((t) => t.departmentId === dept.id);
      return {
        id: dept.id,
        name: dept.name,
        description: dept.description,
        head: dept.leadId ? employees.find((e) => e.id === dept.leadId) ?? null : null,
        employeeCount: members.length,
        activeCount: members.filter(isEmployed).length,
        teamCount: deptTeams.length,
        teams: deptTeams,
      };
    })
    .sort((a, b) => b.employeeCount - a.employeeCount);
}

export interface TeamView {
  id: string;
  name: string;
  departmentId: string;
  departmentName: string;
  manager: Employee | null;
  headcount: number;
  activeCount: number;
}

export function teamViews(
  teams: Team[],
  departments: Department[],
  employees: Employee[],
): TeamView[] {
  const deptById = new Map(departments.map((d) => [d.id, d]));
  return teams
    .map((team) => {
      const members = employees.filter((e) => team.memberIds.includes(e.id));
      return {
        id: team.id,
        name: team.name,
        departmentId: team.departmentId,
        departmentName: deptById.get(team.departmentId)?.name ?? "—",
        manager: team.leadId ? employees.find((e) => e.id === team.leadId) ?? null : null,
        headcount: team.memberIds.length,
        activeCount: members.filter(isEmployed).length,
      };
    })
    .sort((a, b) => b.headcount - a.headcount);
}

export interface ManagerView {
  manager: Employee;
  departmentName: string;
  directReports: number;
  reports: Employee[];
}

export function managerViews(
  employees: Employee[],
  departments: Department[],
): ManagerView[] {
  const deptById = new Map(departments.map((d) => [d.id, d]));
  const reportsByManager = new Map<string, Employee[]>();
  for (const e of employees) {
    const mid = e.employment.managerId;
    if (!mid) continue;
    const list = reportsByManager.get(mid) ?? [];
    list.push(e);
    reportsByManager.set(mid, list);
  }
  return employees
    .filter((e) => reportsByManager.has(e.id))
    .map((manager) => ({
      manager,
      departmentName: deptById.get(manager.employment.departmentId)?.name ?? "—",
      directReports: reportsByManager.get(manager.id)?.length ?? 0,
      reports: reportsByManager.get(manager.id) ?? [],
    }))
    .sort((a, b) => b.directReports - a.directReports);
}

export interface OrgSummary {
  totalEmployees: number;
  activeEmployees: number;
  managers: number;
  departments: number;
  teams: number;
  averageTeamSize: number;
  openPositions: number;
}

export function orgSummary(
  employees: Employee[],
  departments: Department[],
  teams: Team[],
): OrgSummary {
  const managerIds = new Set(
    employees.map((e) => e.employment.managerId).filter(Boolean) as string[],
  );
  const teamSizes = teams.map((t) => t.memberIds.length);
  const avg = teamSizes.length
    ? Math.round((teamSizes.reduce((a, b) => a + b, 0) / teamSizes.length) * 10) / 10
    : 0;

  // Open positions are a deterministic mock: ~1 per 12 active employees.
  const active = employees.filter(isEmployed).length;
  const openPositions = Math.max(3, Math.round(active / 12));

  return {
    totalEmployees: employees.length,
    activeEmployees: active,
    managers: managerIds.size,
    departments: departments.length,
    teams: teams.length,
    averageTeamSize: avg,
    openPositions,
  };
}

/* --------------------------------- org tree ------------------------------- */

export interface OrgNode {
  employee: Employee;
  departmentName: string;
  reports: OrgNode[];
}

export function buildOrgTree(
  employees: Employee[],
  departments: Department[],
): OrgNode[] {
  const deptById = new Map(departments.map((d) => [d.id, d]));
  const childrenByManager = new Map<string, Employee[]>();
  for (const e of employees) {
    const mid = e.employment.managerId ?? "__root__";
    const list = childrenByManager.get(mid) ?? [];
    list.push(e);
    childrenByManager.set(mid, list);
  }

  const sortMembers = (list: Employee[]) =>
    [...list].sort((a, b) => fullName(a).localeCompare(fullName(b)));

  const seen = new Set<string>();
  const build = (employee: Employee): OrgNode => {
    seen.add(employee.id);
    const directReports = sortMembers(childrenByManager.get(employee.id) ?? []).filter(
      (r) => !seen.has(r.id),
    );
    return {
      employee,
      departmentName: deptById.get(employee.employment.departmentId)?.name ?? "—",
      reports: directReports.map(build),
    };
  };

  // Roots = employees with no manager, or whose manager isn't in the dataset.
  const employeeIds = new Set(employees.map((e) => e.id));
  const roots = employees.filter(
    (e) => !e.employment.managerId || !employeeIds.has(e.employment.managerId),
  );

  return sortMembers(roots).map(build);
}

export function countNodes(nodes: OrgNode[]): number {
  return nodes.reduce((sum, n) => sum + 1 + countNodes(n.reports), 0);
}

export interface OrgFilter {
  search: string;
  departmentId: string | null;
  entityId: string | null;
  managerId: string | null;
  status: EmployeeStatus | null;
}

export function emptyOrgFilter(): OrgFilter {
  return { search: "", departmentId: null, entityId: null, managerId: null, status: null };
}

export function matchesOrgFilter(employee: Employee, filter: OrgFilter): boolean {
  if (filter.departmentId && employee.employment.departmentId !== filter.departmentId) return false;
  if (filter.entityId && employee.employment.entityId !== filter.entityId) return false;
  if (filter.managerId && employee.employment.managerId !== filter.managerId) return false;
  if (filter.status && employee.status !== filter.status) return false;
  if (filter.search) {
    const q = filter.search.toLowerCase();
    if (
      !fullName(employee).toLowerCase().includes(q) &&
      !employee.employment.positionTitle.toLowerCase().includes(q)
    ) {
      return false;
    }
  }
  return true;
}