# People Profile runtime read path

Slices 5B.2 through 5E migrate the active employee profile to a server-side runtime boundary. The profile route creates a request-local application runtime from the verified development session and returns an explicit page result: `ready`, `not_found`, `unauthorized`, or `unavailable`.

## Data flow

- Overview calls `PeopleService.getProfile` and receives only `ProfileOverviewViewModel`.
- Work Information uses the same `PeopleService.getProfile` result and receives only `ProfileWorkInformationViewModel`.
- Employment uses the same profile result plus verified labels from `OrganizationReferenceService`, and receives only `ProfileEmploymentViewModel`.
- Contact Information calls `PeopleService.getContact` and receives only `ProfileContactInformationViewModel`.
- Contact authorization or availability failures are represented inside the ready page result, so Overview and Work Information remain usable.

The active shell, header, navigation, and the four available tabs do not read raw `Employee` objects or the legacy Zustand people repository. Department, team, and manager identifiers are resolved only through `OrganizationReferenceService`; failures yield the existing `Not available` UI rather than raw IDs. No work phone is shown because no verified work-phone field exists.

## Tab availability

Overview, Employment, Work Information, and Contact Information are runtime-backed and read-only. The original Compensation, Government IDs, Documents, Timeline, Notes, Emergency Contacts, and Assets tabs remain visible as disabled navigation items with “Coming in a future release.” Direct navigation to one of those historical URLs uses the same runtime profile shell and a safe deferred state; it cannot reactivate a legacy loader.

Employment is intentionally limited to employee number, role/status, verified organization labels, office location, and employment dates. It does not restore compensation summaries, employment history, reporting-chain internals, or personal data.

## Excluded data

Government IDs, personal mobile, personal email, home address, emergency contacts, compensation, tenant/session data, roles, and permissions never enter a profile view model. Editing remains deferred. Documents, Timeline, Notes, and Assets require new purpose-specific DTOs and authorization before they can be restored; Government IDs, Emergency Contacts, and Compensation require separate sensitive-data policies and are not part of this People read surface.
