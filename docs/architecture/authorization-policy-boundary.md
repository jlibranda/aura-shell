# Authorization policy boundary

## Flow

`TrustedRequestContext` → `ApplicationRuntime` → `PermissionAuthorizationPolicy` → `CommandExecutionPipeline` → command handler.

The policy runs after trusted request construction and before any handler business execution. A denied decision returns the standard `authorization_failure` command result; it does not throw and does not invoke the handler.

## Policy source and defaults

The current server-composed policy maps `people.employee.create` preparation to the trusted `people.employee.hire` permission. It reads only the immutable `PermissionSet` in `TrustedRequestContext`; it does not inspect browser fields, cookies, headers, localStorage, form identity, or UI roles.

Unknown command types are denied by default. This keeps future operations closed until their explicit command-to-permission policy is registered.

## Current limits

This is an authorization-attempt boundary only. The policy itself has no persistence, transaction, durable audit, notification, or employee creation capability. Runtime Hire remains a prepared-only workflow; a separate internal in-memory write adapter is test infrastructure only. Future policies may add resource, tenant, purpose, and conflict rules while retaining this policy-before-handler position.
