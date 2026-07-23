# People Directory runtime migration

`/people` is a server route. It creates the trusted development runtime, delegates list and search reads to `PeopleService`, and maps `EmployeeDirectoryDto` into the UI-only `PeopleDirectoryRow` model. The client receives only safe directory fields and stores selected employee IDs only.

The table and card views use the same runtime page result. Search is delegated to the application service and pagination uses bounded offset/limit inputs. Legacy `Employee` directory components remain deferred because they support filters and bulk actions that have not yet been migrated; they are not imported by the runtime-backed `/people` route.

Future work: move supported server-side filters into the application contract, then migrate bulk export and profile mutations behind dedicated application commands.
