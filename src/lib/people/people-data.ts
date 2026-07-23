/**
 * Deterministic People seed data (Philippines-flavored). Produces a complete,
 * realistic dataset: departments, teams, ~48 employees across all statuses with
 * a real reporting hierarchy, compensation history, government IDs (some
 * intentionally missing a TIN), documents, equipment, contacts, timeline, and
 * notes. createSeed() returns a fresh copy so the repository can reset.
 */
import type {
  CompensationRecord,
  Department,
  Employee,
  EmployeeStatus,
  EmploymentType,
  EquipmentItem,
  GovernmentIds,
  PersonDocument,
  SavedView,
  Team,
  TimelineEvent,
} from "@/lib/people/people-types";

export const EMPLOYMENT_TYPE_LABELS: Record<EmploymentType, string> = {
  regular: "Regular",
  probationary: "Probationary",
  contractual: "Contractual",
  project_based: "Project-based",
  part_time: "Part-time",
};

export const DOCUMENT_CATEGORY_LABELS = {
  contract: "Contract",
  government: "Government",
  identification: "Identification",
  payroll: "Payroll",
  performance: "Performance",
  medical: "Medical",
  other: "Other",
} as const;

interface DeptSeed {
  id: string;
  name: string;
  description: string;
  leadTitle: string;
  positions: string[];
}

const DEPARTMENTS_SEED: DeptSeed[] = [
  {
    id: "dep-exec",
    name: "Executive",
    description: "Company leadership.",
    leadTitle: "Chief Executive Officer",
    positions: ["Chief Executive Officer"],
  },
  {
    id: "dep-people",
    name: "People Ops",
    description: "HR, payroll, and people operations.",
    leadTitle: "People Operations Lead",
    positions: ["HR Associate", "Payroll Specialist", "HR Business Partner", "Recruiter"],
  },
  {
    id: "dep-eng",
    name: "Engineering",
    description: "Product engineering and platform.",
    leadTitle: "Head of Engineering",
    positions: ["Software Engineer", "Senior Software Engineer", "QA Engineer", "DevOps Engineer"],
  },
  {
    id: "dep-fin",
    name: "Finance",
    description: "Accounting, treasury, and finance.",
    leadTitle: "Finance Manager",
    positions: ["Accountant", "Financial Analyst", "AP Specialist", "Treasury Analyst"],
  },
  {
    id: "dep-sales",
    name: "Sales",
    description: "Revenue and account management.",
    leadTitle: "Head of Sales",
    positions: ["Account Executive", "Sales Development Rep", "Account Manager", "Sales Ops"],
  },
  {
    id: "dep-support",
    name: "Customer Support",
    description: "Customer success and support.",
    leadTitle: "Support Manager",
    positions: ["Support Specialist", "Customer Success Manager", "Support Team Lead"],
  },
  {
    id: "dep-ops",
    name: "Operations",
    description: "Business and workforce operations.",
    leadTitle: "Operations Manager",
    positions: ["Operations Associate", "Logistics Coordinator", "Operations Analyst"],
  },
  {
    id: "dep-mkt",
    name: "Marketing",
    description: "Brand, growth, and communications.",
    leadTitle: "Marketing Lead",
    positions: ["Marketing Associate", "Content Writer", "Growth Marketer", "Designer"],
  },
];

const FIRST_NAMES = [
  "Andrea", "Carlo", "Bianca", "Diego", "Ella", "Franco", "Gabriela", "Hector",
  "Isabel", "Joaquin", "Karla", "Leo", "Monica", "Nico", "Olivia", "Paolo",
  "Rafael", "Sofia", "Teresa", "Vicente", "Ysabel", "Marco", "Patricia", "Enzo",
];

const LAST_NAMES = [
  "Delgado", "Bautista", "Villanueva", "Ramos", "Aquino", "Mendoza", "Castillo",
  "Navarro", "Salazar", "Domingo", "Fajardo", "Gutierrez", "Ilagan", "Pascual",
  "Rosales", "Tolentino", "Uy", "Ventura", "Zamora", "Bacani", "Cortez", "Espino",
];

interface AnchorSeed {
  id: string;
  firstName: string;
  lastName: string;
  deptId: string;
  managerId?: string;
  positionTitle: string;
  status: EmployeeStatus;
  employmentType: EmploymentType;
  entityId: string;
  locationLabel: string;
  hireDate: string;
  isLead?: boolean;
  missingTin?: boolean;
  base: number;
}

const ENTITY_MANILA = "nw-ph";
const ENTITY_CEBU = "nw-cebu";

/** Explicit anchor employees that other logic depends on. */
const ANCHORS: AnchorSeed[] = [
  {
    id: "emp-1000",
    firstName: "David",
    lastName: "Chen",
    deptId: "dep-exec",
    positionTitle: "Chief Executive Officer",
    status: "regular",
    employmentType: "regular",
    entityId: ENTITY_MANILA,
    locationLabel: "Manila HQ",
    hireDate: "2019-02-01",
    isLead: true,
    base: 420000,
  },
  {
    id: "emp-1001",
    firstName: "Maria",
    lastName: "Santos",
    deptId: "dep-people",
    managerId: "emp-1000",
    positionTitle: "People Operations Lead",
    status: "regular",
    employmentType: "regular",
    entityId: ENTITY_MANILA,
    locationLabel: "Manila HQ",
    hireDate: "2020-06-15",
    isLead: true,
    base: 135000,
  },
  {
    id: "emp-1002",
    firstName: "Elena",
    lastName: "Reyes",
    deptId: "dep-eng",
    managerId: "emp-1000",
    positionTitle: "Head of Engineering",
    status: "regular",
    employmentType: "regular",
    entityId: ENTITY_MANILA,
    locationLabel: "Manila HQ",
    hireDate: "2019-09-10",
    isLead: true,
    base: 210000,
  },
  {
    id: "emp-1003",
    firstName: "Ramon",
    lastName: "Garcia",
    deptId: "dep-fin",
    managerId: "emp-1000",
    positionTitle: "Finance Manager",
    status: "regular",
    employmentType: "regular",
    entityId: ENTITY_MANILA,
    locationLabel: "Manila HQ",
    hireDate: "2020-01-20",
    isLead: true,
    base: 160000,
  },
  {
    id: "emp-1004",
    firstName: "Lucia",
    lastName: "Flores",
    deptId: "dep-sales",
    managerId: "emp-1000",
    positionTitle: "Head of Sales",
    status: "regular",
    employmentType: "regular",
    entityId: ENTITY_MANILA,
    locationLabel: "Manila HQ",
    hireDate: "2020-03-05",
    isLead: true,
    base: 175000,
  },
  {
    id: "emp-1005",
    firstName: "Grace",
    lastName: "Lim",
    deptId: "dep-support",
    managerId: "emp-1000",
    positionTitle: "Support Manager",
    status: "regular",
    employmentType: "regular",
    entityId: ENTITY_CEBU,
    locationLabel: "Cebu Office",
    hireDate: "2021-04-12",
    isLead: true,
    base: 120000,
  },
  {
    id: "emp-1006",
    firstName: "Miguel",
    lastName: "Cruz",
    deptId: "dep-ops",
    managerId: "emp-1000",
    positionTitle: "Operations Manager",
    status: "regular",
    employmentType: "regular",
    entityId: ENTITY_CEBU,
    locationLabel: "Cebu Office",
    hireDate: "2020-11-02",
    isLead: true,
    base: 130000,
  },
  {
    id: "emp-1007",
    firstName: "Patricia",
    lastName: "Yu",
    deptId: "dep-mkt",
    managerId: "emp-1000",
    positionTitle: "Marketing Lead",
    status: "regular",
    employmentType: "regular",
    entityId: ENTITY_MANILA,
    locationLabel: "Manila HQ",
    hireDate: "2021-01-18",
    isLead: true,
    base: 125000,
  },
  {
    id: "emp-2000",
    firstName: "John",
    lastName: "Rivera",
    deptId: "dep-eng",
    managerId: "emp-1002",
    positionTitle: "Senior Software Engineer",
    status: "regular",
    employmentType: "regular",
    entityId: ENTITY_MANILA,
    locationLabel: "Manila HQ",
    hireDate: "2021-07-01",
    base: 115000,
  },
  {
    id: "emp-2001",
    firstName: "Ana",
    lastName: "Domingo",
    deptId: "dep-fin",
    managerId: "emp-1003",
    positionTitle: "Financial Analyst",
    status: "regular",
    employmentType: "regular",
    entityId: ENTITY_MANILA,
    locationLabel: "Manila HQ",
    hireDate: "2022-02-14",
    base: 62000,
  },
  {
    id: "emp-2002",
    firstName: "Bea",
    lastName: "Ocampo",
    deptId: "dep-people",
    managerId: "emp-1001",
    positionTitle: "HR Business Partner",
    status: "regular",
    employmentType: "regular",
    entityId: ENTITY_MANILA,
    locationLabel: "Manila HQ",
    hireDate: "2022-05-09",
    base: 78000,
  },
  {
    id: "emp-2003",
    firstName: "Ryan",
    lastName: "Torres",
    deptId: "dep-people",
    managerId: "emp-1001",
    positionTitle: "Payroll Specialist",
    status: "regular",
    employmentType: "regular",
    entityId: ENTITY_MANILA,
    locationLabel: "Manila HQ",
    hireDate: "2023-08-21",
    base: 58000,
    missingTin: true,
  },
  {
    id: "emp-2004",
    firstName: "Camille",
    lastName: "Suarez",
    deptId: "dep-support",
    managerId: "emp-1005",
    positionTitle: "Customer Success Manager",
    status: "on_leave",
    employmentType: "regular",
    entityId: ENTITY_CEBU,
    locationLabel: "Cebu Office",
    hireDate: "2022-09-30",
    base: 72000,
  },
  {
    id: "emp-2005",
    firstName: "Kevin",
    lastName: "Alonzo",
    deptId: "dep-sales",
    managerId: "emp-1004",
    positionTitle: "Account Executive",
    status: "suspended",
    employmentType: "regular",
    entityId: ENTITY_MANILA,
    locationLabel: "Manila HQ",
    hireDate: "2021-11-15",
    base: 68000,
  },
  {
    id: "emp-2006",
    firstName: "Dianne",
    lastName: "Padilla",
    deptId: "dep-mkt",
    managerId: "emp-1007",
    positionTitle: "Content Writer",
    status: "resigned",
    employmentType: "regular",
    entityId: ENTITY_MANILA,
    locationLabel: "Manila HQ",
    hireDate: "2021-03-22",
    base: 55000,
  },
  {
    id: "emp-2007",
    firstName: "Oscar",
    lastName: "Benitez",
    deptId: "dep-ops",
    managerId: "emp-1006",
    positionTitle: "Logistics Coordinator",
    status: "terminated",
    employmentType: "regular",
    entityId: ENTITY_CEBU,
    locationLabel: "Cebu Office",
    hireDate: "2020-08-03",
    base: 52000,
  },
  {
    id: "emp-2008",
    firstName: "Rosa",
    lastName: "Mercado",
    deptId: "dep-fin",
    managerId: "emp-1003",
    positionTitle: "Accountant",
    status: "retired",
    employmentType: "regular",
    entityId: ENTITY_MANILA,
    locationLabel: "Manila HQ",
    hireDate: "2019-05-27",
    base: 90000,
  },
];

/* deterministic PRNG so the dataset is stable across reloads */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pad(n: number, width: number): string {
  return String(n).padStart(width, "0");
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function govNumber(rng: () => number, groups: number[]): string {
  return groups.map((g) => pad(Math.floor(rng() * Math.pow(10, g)), g)).join("-");
}

function buildGovIds(rng: () => number, missingTin: boolean): GovernmentIds {
  return {
    sss: { number: govNumber(rng, [2, 7, 1]), verified: rng() > 0.2 },
    philhealth: { number: govNumber(rng, [2, 9, 1]), verified: rng() > 0.25 },
    pagibig: { number: govNumber(rng, [4, 4, 4]), verified: rng() > 0.25 },
    tin: missingTin
      ? { number: null, verified: false }
      : { number: govNumber(rng, [3, 3, 3, 3]), verified: rng() > 0.3 },
  };
}

function compRecord(
  id: string,
  effectiveDate: string,
  baseMonthly: number,
  reason: string,
  changedBy: string,
): CompensationRecord {
  return {
    id,
    effectiveDate,
    baseMonthly,
    currency: "PHP",
    payFrequency: "semi_monthly",
    reason,
    changedBy,
  };
}

function hiredEvent(id: string, hireDate: string, title: string): TimelineEvent {
  return {
    id: `tl-${id}-hired`,
    type: "hired",
    title: "Hired",
    description: title,
    timestamp: `${hireDate}T09:00:00.000Z`,
    actor: "Maria Santos",
  };
}

function statusEvent(id: string, status: EmployeeStatus, date: string): TimelineEvent | null {
  const map: Partial<Record<EmployeeStatus, { type: TimelineEvent["type"]; title: string }>> = {
    on_leave: { type: "status_change", title: "Went on leave" },
    suspended: { type: "suspended", title: "Suspended" },
    resigned: { type: "resigned", title: "Resigned" },
    terminated: { type: "terminated", title: "Terminated" },
    retired: { type: "retired", title: "Retired" },
  };
  const entry = map[status];
  if (!entry) return null;
  return {
    id: `tl-${id}-status`,
    type: entry.type,
    title: entry.title,
    timestamp: `${date}T10:00:00.000Z`,
    actor: "Maria Santos",
  };
}

function buildEmployee(seed: AnchorSeed, rng: () => number): Employee {
  const number = seed.id.replace("emp-", "");
  const hireDateObj = new Date(seed.hireDate);
  const raiseDate = new Date(hireDateObj);
  raiseDate.setFullYear(raiseDate.getFullYear() + 1);

  const history: CompensationRecord[] = [
    compRecord(`comp-${seed.id}-1`, seed.hireDate, Math.round(seed.base * 0.9), "Hired", "Maria Santos"),
  ];
  const now = new Date();
  if (raiseDate < now) {
    history.push(
      compRecord(`comp-${seed.id}-2`, isoDate(raiseDate), seed.base, "Annual increase", "Maria Santos"),
    );
  }
  const current = history[history.length - 1];

  const probationEnd = new Date(hireDateObj);
  probationEnd.setMonth(probationEnd.getMonth() + 6);

  const timeline: TimelineEvent[] = [hiredEvent(seed.id, seed.hireDate, seed.positionTitle)];
  const sEvent = statusEvent(seed.id, seed.status, isoDate(now));
  if (sEvent) timeline.push(sEvent);

  const contactFirst = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
  const contactLast = seed.lastName;

  return {
    id: seed.id,
    employeeNumber: `NW-${number}`,
    status: seed.status,
    personal: {
      firstName: seed.firstName,
      lastName: seed.lastName,
      email: `${seed.firstName.toLowerCase()}.${seed.lastName.toLowerCase()}@northwind.ph`,
      phone: `+63 9${pad(Math.floor(rng() * 1000000000), 9)}`,
      dateOfBirth: isoDate(new Date(1985 + Math.floor(rng() * 15), Math.floor(rng() * 12), 1 + Math.floor(rng() * 27))),
      gender: rng() > 0.5 ? "female" : "male",
      maritalStatus: rng() > 0.5 ? "single" : "married",
      address: `${Math.floor(rng() * 900) + 100} Mabini St, ${seed.locationLabel}`,
    },
    employment: {
      positionTitle: seed.positionTitle,
      employmentType: seed.employmentType,
      departmentId: seed.deptId,
      managerId: seed.managerId,
      entityId: seed.entityId,
      locationLabel: seed.locationLabel,
      hireDate: seed.hireDate,
      probationEndDate: isoDate(probationEnd),
      regularizationDate:
        seed.employmentType === "regular" ? isoDate(probationEnd) : undefined,
    },
    compensation: { current, history },
    governmentIds: buildGovIds(rng, Boolean(seed.missingTin)),
    emergencyContacts: [
      {
        id: `ec-${seed.id}-1`,
        name: `${contactFirst} ${contactLast}`,
        relationship: rng() > 0.5 ? "Spouse" : "Parent",
        phone: `+63 9${pad(Math.floor(rng() * 1000000000), 9)}`,
        isPrimary: true,
      },
    ],
    timeline,
    notes:
      rng() > 0.7
        ? [
            {
              id: `note-${seed.id}-1`,
              body: "Onboarding completed on schedule.",
              author: "Maria Santos",
              createdAt: `${seed.hireDate}T12:00:00.000Z`,
            },
          ]
        : [],
    offboardedAt: null,
  };
}

function buildDocuments(employee: Employee, rng: () => number): PersonDocument[] {
  const uploadedAt = `${employee.employment.hireDate}T09:30:00.000Z`;
  const docs: PersonDocument[] = [
    {
      id: `doc-${employee.id}-contract`,
      employeeId: employee.id,
      name: "Employment Contract",
      category: "contract",
      currentVersionId: `dv-${employee.id}-contract-1`,
      versions: [
        {
          id: `dv-${employee.id}-contract-1`,
          versionLabel: "v1",
          uploadedBy: "Maria Santos",
          uploadedAt,
          sizeLabel: `${(rng() * 2 + 0.3).toFixed(1)} MB`,
        },
      ],
    },
    {
      id: `doc-${employee.id}-govids`,
      employeeId: employee.id,
      name: "Government IDs",
      category: "government",
      currentVersionId: `dv-${employee.id}-govids-1`,
      versions: [
        {
          id: `dv-${employee.id}-govids-1`,
          versionLabel: "v1",
          uploadedBy: "Maria Santos",
          uploadedAt,
          sizeLabel: `${(rng() * 1 + 0.2).toFixed(1)} MB`,
        },
      ],
    },
  ];
  return docs;
}

function buildEquipment(employee: Employee, rng: () => number): EquipmentItem[] {
  if (rng() > 0.65) return [];
  return [
    {
      id: `eq-${employee.id}-laptop`,
      employeeId: employee.id,
      type: "laptop",
      name: rng() > 0.5 ? 'MacBook Pro 14"' : "Dell Latitude 7440",
      serial: `SN-${pad(Math.floor(rng() * 100000000), 8)}`,
      assignedAt: `${employee.employment.hireDate}T09:00:00.000Z`,
      returnedAt: employee.offboardedAt ?? null,
      status: "assigned",
    },
  ];
}

export interface PeopleSeed {
  employees: Employee[];
  departments: Department[];
  teams: Team[];
  documents: PersonDocument[];
  equipment: EquipmentItem[];
}

export function createSeed(): PeopleSeed {
  const rng = mulberry32(20260721);
  const now = new Date();

  const leadByDept = new Map<string, string>();
  for (const a of ANCHORS) {
    if (a.isLead) leadByDept.set(a.deptId, a.id);
  }

  const seeds: AnchorSeed[] = [...ANCHORS];

  // Generate the remaining staff to reach a rich dataset (~48 total).
  const generatedTarget = 48 - seeds.length;
  const staffDepts = DEPARTMENTS_SEED.filter((d) => d.id !== "dep-exec");
  let counter = 2009;

  for (let i = 0; i < generatedTarget; i++) {
    const dept = staffDepts[i % staffDepts.length];
    const firstName = FIRST_NAMES[Math.floor(rng() * FIRST_NAMES.length)];
    const lastName = LAST_NAMES[Math.floor(rng() * LAST_NAMES.length)];
    const position = dept.positions[Math.floor(rng() * dept.positions.length)];
    const lead = leadByDept.get(dept.id) ?? "emp-1000";

    // Status distribution: mostly regular/probationary, occasional on_leave.
    let status: EmployeeStatus = "regular";
    let employmentType: EmploymentType = "regular";
    const roll = rng();
    if (roll > 0.82) {
      status = "probationary";
      employmentType = "probationary";
    } else if (roll > 0.76) {
      status = "on_leave";
    }

    // A few recent hires (this month) for the "hired this month" example.
    let hireDate: string;
    if (i < 3) {
      const d = new Date(now.getFullYear(), now.getMonth(), Math.min(2 + i * 4, 26));
      hireDate = isoDate(d);
      status = "probationary";
      employmentType = "probationary";
    } else {
      const year = 2021 + Math.floor(rng() * 4);
      const month = Math.floor(rng() * 12);
      const day = 1 + Math.floor(rng() * 27);
      hireDate = isoDate(new Date(year, month, day));
    }

    const entity = rng() > 0.7 ? ENTITY_CEBU : ENTITY_MANILA;
    seeds.push({
      id: `emp-${counter++}`,
      firstName,
      lastName,
      deptId: dept.id,
      managerId: lead,
      positionTitle: position,
      status,
      employmentType,
      entityId: entity,
      locationLabel: entity === ENTITY_CEBU ? "Cebu Office" : "Manila HQ",
      hireDate,
      base: 40000 + Math.floor(rng() * 45000),
      missingTin: rng() > 0.86,
    });
  }

  const employees = seeds.map((s) => buildEmployee(s, rng));

  const departments: Department[] = DEPARTMENTS_SEED.map((d) => ({
    id: d.id,
    name: d.name,
    description: d.description,
    leadId: leadByDept.get(d.id),
  }));

  // One team per non-exec department, plus an extra Engineering team.
  const teams: Team[] = [];
  for (const d of DEPARTMENTS_SEED) {
    if (d.id === "dep-exec") continue;
    const members = employees.filter((e) => e.employment.departmentId === d.id);
    const team: Team = {
      id: `team-${d.id}`,
      name: `${d.name} Team`,
      departmentId: d.id,
      leadId: leadByDept.get(d.id),
      memberIds: members.map((m) => m.id),
    };
    teams.push(team);
    for (const m of members) m.employment.teamId = team.id;
  }
  const engExtraMembers = employees
    .filter((e) => e.employment.departmentId === "dep-eng")
    .slice(0, 2);
  if (engExtraMembers.length) {
    teams.push({
      id: "team-dep-eng-platform",
      name: "Platform Team",
      departmentId: "dep-eng",
      leadId: leadByDept.get("dep-eng"),
      memberIds: engExtraMembers.map((m) => m.id),
    });
  }

  const documents: PersonDocument[] = [];
  const equipment: EquipmentItem[] = [];
  for (const e of employees) {
    documents.push(...buildDocuments(e, rng));
    equipment.push(...buildEquipment(e, rng));
  }

  return { employees, departments, teams, documents, equipment };
}

/** Seeded saved views demonstrated in the directory. */
export const DEFAULT_SAVED_VIEWS: readonly SavedView[] = [
  {
    id: "sv-new-hires",
    name: "New hires",
    system: true,
    query: { sortKey: "hireDate", sortDir: "desc" },
  },
  {
    id: "sv-missing-gov",
    name: "Missing government IDs",
    system: true,
    query: { missingGovId: "tin" },
  },
  {
    id: "sv-probationary",
    name: "Probationary",
    system: true,
    query: { statuses: ["probationary"] },
  },
];
