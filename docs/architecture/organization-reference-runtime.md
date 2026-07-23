# Organization Reference Runtime

Slice 5C provides the reusable, tenant-aware organization display-reference boundary for AURA. Application UI consumes only `OrganizationReferenceDto` values (`id`, `displayName`, and `type`) through the application runtime.

## Runtime flow

`TenantContext → OrganizationReferenceService → OrganizationReferenceRepository → OrganizationReferenceDto → ViewModel`

`OrganizationReferenceApplicationService` requires `people.read`, applies the request tenant to every lookup, and resolves department, team, and manager references. It returns `undefined` for missing, deleted, cross-tenant, or unsupported records. Repository implementation details, tenant identifiers, and raw employee objects do not leave the platform layer.

## Profile integration

The profile loader obtains the employee profile from `PeopleService.getProfile`, then calls `organizationReferences.resolveSummary` for its department, team, and manager identifiers. Work Information receives only resolved display labels. A lookup authorization/runtime failure or a missing reference does not fail the profile: the corresponding field renders `Not available`.

## Reuse

Future Attendance, Leave, Payroll, Recruitment, Workflow, and Analytics read paths must consume the same `OrganizationReferenceService` through `ApplicationRuntime`; they must not query the legacy UI store or fabricate labels.

Supported today: department, team, manager. Unsupported today: office, business unit, and cost center, because the application contracts do not yet expose verified reference records for them.
