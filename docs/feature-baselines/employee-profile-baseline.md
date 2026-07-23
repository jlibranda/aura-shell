# Employee Profile feature baseline

This is a parity baseline for migration work. It distinguishes active runtime behavior from audited legacy behavior; legacy behavior is not a promise of current availability.

## Current active runtime

- Header: back link, derived avatar/initials, display name, status, position, employee number.
- Active read-only tabs: Overview, Employment, Work Information, Contact Information.
- Overview: employee number, status, position, location, hire date, regularization date.
- Employment and Work Information: supported employment fields plus verified department, team, and manager labels.
- Contact Information: verified work email only.
- Deferred clickable tabs: Compensation, Government IDs, Documents, Timeline, Notes, Emergency Contacts, Assets. Each uses the runtime shell and says “Coming in a future release.”
- Direct historical URLs preserve the selected deferred tab; the tab strip is horizontally scrollable at narrow widths.
- Safe profile results: loading where framework navigation applies, unavailable, unauthorized, and not-found. No edit actions or Government ID values are active.

## Legacy audited behavior

- Overview contained a masked Government summary: TIN, SSS, PhilHealth, Pag-IBIG, last four characters only, plus missing/verified state.
- Government IDs tab showed those identifiers with reveal, copy, edit/save, verify/reject, cancel, and verification metadata. It used the raw `Employee` object, the legacy People store, a localStorage verification store, and mock actor identity.
- A profile Actions dropdown exposed Edit profile, Promote, Transfer, Salary change, conditional Regularize, and Change manager via legacy drawers. It is not mounted in the runtime profile.
- Legacy repository methods also existed for suspend, reactivate, terminate, and offboard, but those were not active profile-menu entries.

## Planned restoration

- Government IDs: masked read model after authentication; reveal/copy only with purpose-specific permissions and auditing; edits/verification only with durable authorized commands.
- Profile writes: independently authorized commands after authentication and persistence. Compensation moves to the Payroll domain.
- Documents, Timeline, Notes, Emergency Contacts, and Assets: each requires its own narrow DTO, authorization, and persistence decision.

## Change-control rule

Any change to this baseline must reference affected records in the Business Capability Registry and state whether parity is preserved, deferred, moved, excluded, or retired with approval.
