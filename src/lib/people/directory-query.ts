/**
 * Pure directory query helpers: parse/serialize URL params, then
 * filter → sort → paginate employees. No React, no side effects.
 */
import type {
  Department,
  DirectoryQuery,
  Employee,
  EmployeeStatus,
  EmploymentType,
  GovIdKey,
  SortDir,
  SortKey,
  ViewMode,
} from "@/lib/people/people-types";
import { ACTIVE_UMBRELLA } from "@/lib/people/status-machine";

export const DEFAULT_PAGE_SIZE = 25;
export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const SORT_KEYS: SortKey[] = [
  "name",
  "employeeNumber",
  "positionTitle",
  "department",
  "status",
  "hireDate",
];

export function defaultQuery(): DirectoryQuery {
  return {
    search: "",
    statuses: [],
    departmentIds: [],
    teamIds: [],
    employmentTypes: [],
    managerId: null,
    entityId: null,
    missingGovId: null,
    hiredFrom: null,
    hiredTo: null,
    sortKey: "name",
    sortDir: "asc",
    page: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    view: "table",
  };
}

function splitList(value: string | null): string[] {
  if (!value) return [];
  return value
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
}

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function readParam(source: ParamSource, key: string): string | null {
  if (source instanceof URLSearchParams) return source.get(key);
  const raw = source[key];
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw ?? null;
}

export function parseQuery(source: ParamSource): DirectoryQuery {
  const base = defaultQuery();
  const num = (v: string | null, fallback: number) => {
    const n = v ? Number(v) : NaN;
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };

  const view = readParam(source, "view");
  const sort = readParam(source, "sort");
  const dir = readParam(source, "dir");
  const missing = readParam(source, "missing");

  return {
    ...base,
    search: readParam(source, "q") ?? "",
    statuses: splitList(readParam(source, "status")) as EmployeeStatus[],
    departmentIds: splitList(readParam(source, "dept")),
    teamIds: splitList(readParam(source, "team")),
    employmentTypes: splitList(readParam(source, "type")) as EmploymentType[],
    managerId: readParam(source, "manager") || null,
    entityId: readParam(source, "entity") || null,
    missingGovId: (missing as GovIdKey) || null,
    hiredFrom: readParam(source, "from") || null,
    hiredTo: readParam(source, "to") || null,
    sortKey: (SORT_KEYS.includes(sort as SortKey) ? sort : "name") as SortKey,
    sortDir: (dir === "desc" ? "desc" : "asc") as SortDir,
    page: num(readParam(source, "page"), 1),
    pageSize: num(readParam(source, "size"), DEFAULT_PAGE_SIZE),
    view: (view === "cards" ? "cards" : "table") as ViewMode,
  };
}

export function serializeQuery(query: DirectoryQuery): URLSearchParams {
  const params = new URLSearchParams();
  const d = defaultQuery();

  if (query.search) params.set("q", query.search);
  if (query.statuses.length) params.set("status", query.statuses.join(","));
  if (query.departmentIds.length) params.set("dept", query.departmentIds.join(","));
  if (query.teamIds.length) params.set("team", query.teamIds.join(","));
  if (query.employmentTypes.length) params.set("type", query.employmentTypes.join(","));
  if (query.managerId) params.set("manager", query.managerId);
  if (query.entityId) params.set("entity", query.entityId);
  if (query.missingGovId) params.set("missing", query.missingGovId);
  if (query.hiredFrom) params.set("from", query.hiredFrom);
  if (query.hiredTo) params.set("to", query.hiredTo);
  if (query.sortKey !== d.sortKey) params.set("sort", query.sortKey);
  if (query.sortDir !== d.sortDir) params.set("dir", query.sortDir);
  if (query.page !== d.page) params.set("page", String(query.page));
  if (query.pageSize !== d.pageSize) params.set("size", String(query.pageSize));
  if (query.view !== d.view) params.set("view", query.view);

  return params;
}

export function fullName(e: Employee): string {
  const { firstName, lastName, preferredName } = e.personal;
  return preferredName
    ? `${preferredName} ${lastName}`
    : `${firstName} ${lastName}`;
}

function matchesSearch(e: Employee, term: string): boolean {
  if (!term) return true;
  const t = term.toLowerCase();
  return (
    fullName(e).toLowerCase().includes(t) ||
    `${e.personal.firstName} ${e.personal.lastName}`.toLowerCase().includes(t) ||
    e.personal.email.toLowerCase().includes(t) ||
    e.employeeNumber.toLowerCase().includes(t) ||
    e.employment.positionTitle.toLowerCase().includes(t)
  );
}

function matchesStatus(e: Employee, statuses: EmployeeStatus[]): boolean {
  if (!statuses.length) return true;
  if (statuses.includes("active")) {
    if (ACTIVE_UMBRELLA.includes(e.status)) return true;
  }
  return statuses.includes(e.status);
}

function withinDateRange(date: string, from: string | null, to: string | null) {
  if (from && date < from) return false;
  if (to && date > to) return false;
  return true;
}

export interface QueryContext {
  departments?: Department[];
}

export interface QueryResult {
  rows: Employee[];
  total: number;
  filteredTotal: number;
  pageCount: number;
  page: number;
}

export function filterEmployees(
  employees: Employee[],
  query: DirectoryQuery,
): Employee[] {
  return employees.filter((e) => {
    if (!matchesSearch(e, query.search)) return false;
    if (!matchesStatus(e, query.statuses)) return false;
    if (query.departmentIds.length && !query.departmentIds.includes(e.employment.departmentId))
      return false;
    if (
      query.teamIds.length &&
      !(e.employment.teamId && query.teamIds.includes(e.employment.teamId))
    )
      return false;
    if (
      query.employmentTypes.length &&
      !query.employmentTypes.includes(e.employment.employmentType)
    )
      return false;
    if (query.managerId && e.employment.managerId !== query.managerId) return false;
    if (query.entityId && e.employment.entityId !== query.entityId) return false;
    if (query.missingGovId && e.governmentIds[query.missingGovId].number) return false;
    if (
      (query.hiredFrom || query.hiredTo) &&
      !withinDateRange(e.employment.hireDate, query.hiredFrom, query.hiredTo)
    )
      return false;
    return true;
  });
}

function sortValue(
  e: Employee,
  key: SortKey,
  departments: Map<string, string>,
): string | number {
  switch (key) {
    case "name":
      return fullName(e).toLowerCase();
    case "employeeNumber":
      return e.employeeNumber.toLowerCase();
    case "positionTitle":
      return e.employment.positionTitle.toLowerCase();
    case "department":
      return (departments.get(e.employment.departmentId) ?? "").toLowerCase();
    case "status":
      return e.status;
    case "hireDate":
      return e.employment.hireDate;
    default:
      return "";
  }
}

export function sortEmployees(
  employees: Employee[],
  key: SortKey,
  dir: SortDir,
  ctx: QueryContext = {},
): Employee[] {
  const deptMap = new Map((ctx.departments ?? []).map((d) => [d.id, d.name]));
  const factor = dir === "asc" ? 1 : -1;
  return [...employees].sort((a, b) => {
    const av = sortValue(a, key, deptMap);
    const bv = sortValue(b, key, deptMap);
    if (av < bv) return -1 * factor;
    if (av > bv) return 1 * factor;
    return 0;
  });
}

export function applyQuery(
  employees: Employee[],
  query: DirectoryQuery,
  ctx: QueryContext = {},
): QueryResult {
  const filtered = sortEmployees(
    filterEmployees(employees, query),
    query.sortKey,
    query.sortDir,
    ctx,
  );
  const filteredTotal = filtered.length;
  const pageCount = Math.max(1, Math.ceil(filteredTotal / query.pageSize));
  const page = Math.min(Math.max(1, query.page), pageCount);
  const start = (page - 1) * query.pageSize;
  const rows = filtered.slice(start, start + query.pageSize);

  return { rows, total: employees.length, filteredTotal, pageCount, page };
}

export function countByStatus(
  employees: Employee[],
): Record<EmployeeStatus, number> {
  const counts = {
    probationary: 0,
    regular: 0,
    active: 0,
    on_leave: 0,
    suspended: 0,
    resigned: 0,
    terminated: 0,
    retired: 0,
  } as Record<EmployeeStatus, number>;
  for (const e of employees) counts[e.status] += 1;
  return counts;
}