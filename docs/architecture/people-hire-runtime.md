# People hire runtime boundary

## Current flow

`/people` Add employee → `/people/hire` → server-owned safe reference loader → `RuntimeHirePage` → immutable `CreateEmployeeCommand` → validation-only command handler → prepared result.

The runtime page owns six visible steps: Personal, Contact, Employment, Government IDs, Emergency Contact, and Review. All editable non-Government values live only in component memory. Refresh intentionally clears them; no browser storage is used.

## Reference boundaries

Department, Team, and Manager options are loaded through `OrganizationReferenceService.list`, which returns only tenant-isolated `OrganizationReferenceOptionDto` values (`id`, `displayName`, `type`, and internal team parent metadata). Entity and Business Unit have no legitimate runtime reference source yet and therefore remain visible deferred fields. Pay Frequency is visible but belongs to future Payroll reference onboarding.

## Security and submission

The preparation path does not open a repository transaction or Unit of Work. The Unit of Work exists only for the internal server-side persistence test path.

TIN, SSS, PhilHealth, and Pag-IBIG are visible `BLOCKED_SECURITY` statuses only. No raw values, reveal, copy, validation, or persistence are possible. The prepared command must pass trusted permission policy but performs no repository call or employee creation. Production submission remains deferred until later Epic 6 authority and persistence slices.

## Slice 6K Runtime Hire activation

After the existing prepared review, the user may explicitly choose **Create employee**. The browser submits only the prepared business command and a client-generated idempotency key to a server action. That action constructs the server-owned trusted request context and delegates to the Trusted Submission Gateway; the gateway performs authorization, durable idempotency, and durable creation. The browser receives only a sanitized employee identifier and navigates to the profile.

Government IDs remain blocked, and the activation adds no payroll, compensation, notification, outbox, or alternative write path.
