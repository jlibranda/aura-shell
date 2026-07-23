# Controlled development People seed

## Purpose

`npm run seed:development` inserts the approved synthetic People fixture projection into the configured development database so a later Prisma read-model migration can preserve the current directory and profile baseline.

It is a manual operator command. It does not run from Prisma migrations, application startup, routes, loaders, Runtime Hire, browser actions, tests, or builds.

## Controls

- The command sets `AURA_SEED_ENV=development`; the seed fails when `NODE_ENV=production` or the development marker is absent.
- It uses the single approved development tenant `nw-ph`.
- It inserts only when the Employee table is empty. A repeated run reports `already_seeded` only when exactly the approved 48 rows already exist for that tenant.
- It never clears, updates, resets, or overwrites Employee rows.
- It never creates, changes, or deletes AuditRecord rows.
- It uses one database transaction for tenant creation and employee insertion.

## Fixture boundary

The fixture projection supplies only employee ID/number, display name, work email, organizational identifiers, position, employment status/type, hire date, and work location. The Prisma schema currently requires a few non-null personal columns that are outside the read models; the seed supplies neutral non-informational placeholders for those columns and never exposes them.

The seed deliberately excludes Government IDs, compensation, payroll, banking, tax information, personal email, personal mobile, home address, emergency contacts, documents, timeline, notes, and audit evidence. It does not copy real or production employee data.

## Runbook

1. Confirm the local ignored `.env` points to the approved development database.
2. Confirm the database contains no employee records, or exactly the previously seeded development fixture set.
3. Run `npm run seed:development`.
4. Confirm the command reports 48 approved synthetic employees.
5. Do not run this command against production or a shared environment.

This seed does not activate Prisma read routes. Slice 6I must introduce read-side contracts and explicitly select the durable read runtime.
