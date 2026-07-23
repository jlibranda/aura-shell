# People Directory runtime read path

The active `/people` route is the canonical read-only runtime directory. It loads `EmployeeDirectoryDto` records through `PeopleService`, resolves only department and manager display labels through `OrganizationReferenceService`, then maps the result to `PeopleDirectoryRow` for the table and card UI.

## Directory-safe row boundary

`PeopleDirectoryRow` contains employee ID, employee number, display name, verified work email, position, employment status, resolved department and manager display labels, and hire date. Avatar initials are derived from `displayName`; they do not require additional data.

Raw organization identifiers, team, employment type, location, entity, Government IDs, personal contact information, compensation, emergency contacts, and edit/bulk-write actions do not reach the directory UI. A missing or unavailable organization reference renders `Not available` without failing the listing.

The organization service resolves the page as a batch and de-duplicates matching department/manager references. Future directory filters and organization fields must use the same runtime service rather than the legacy People store.

`/people/runtime-directory` now redirects to `/people`; it no longer presents a competing integration-only directory.
