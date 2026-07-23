# Employee Hire feature baseline

## Route and persistence

- Route: `/people/hire`; direct navigation and refresh are supported.
- Runtime-only form state; refresh clears entered data.
- No employee is created or saved. Final preparation is explicitly non-authoritative.

## Steps and fields

| Step | Fields | Validation / status |
|---|---|---|
| Personal | First name*, Middle name, Last name*, Preferred name, Birth date*, Gender*, Civil status*, Nationality* | Required fields match legacy; birth date cannot be future |
| Contact | Personal email, Work email*, Mobile number*, Address | Email format when supplied; work email and mobile required; legacy phone format retained |
| Employment | Entity, Business unit, Department*, Team, Position*, Manager, Employment type*, Hire date*, Work location*, Pay frequency | Department/Team/Manager use safe runtime references. Entity and Business unit are visible deferred. Pay frequency is visible and Payroll-owned deferred. |
| Government IDs | TIN, SSS, PhilHealth, Pag-IBIG | Visible `BLOCKED_SECURITY` statuses only; never editable or raw. |
| Emergency Contact | Contact name, Relationship, Mobile number, Email, Address | Entire section optional; when any field is entered, name, relationship, and mobile are required; email/phone format rules apply. |
| Review | Personal, Contact, Employment, Government ID status, Emergency Contact | Each editable section has Edit navigation. |

## Navigation and helpers

- Continue, Back, completed-step navigation, dirty-form Cancel confirmation, inline validation, section helpers, Review Edit links, Prepare another, and directory return are active.
- Government helper: secure onboarding is required; no raw values are available.
- Emergency helper: the group is optional until any field is entered.
- The page states that it is not saved, refresh clears information, and final preparation does not create an employee.

## Parity control

[`RUNTIME_HIRE_FIELD_MANIFEST`](../../src/platform/people/runtime-hire-parity.ts) is the authoritative 31-field inventory. Each field must use exactly one disposition: `ACTIVE_RUNTIME`, `DEFERRED_VISIBLE`, `BLOCKED_SECURITY`, `MOVED_TO_ANOTHER_MODULE`, or `RETIRED_APPROVED`.
