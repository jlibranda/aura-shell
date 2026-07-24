# AURA Product Vision & Engineering Constitution

**Version 1.0**

This is the highest-level reference for AURA. Every ADR, implementation prompt,
module design, and code review inherits from it. When a lower-level document
and this one disagree, this one wins — or this one gets amended, deliberately,
with a version bump. Nothing here is aspirational filler; each statement is a
constraint we have already paid for in the architecture and intend to keep
paying for.

Read this before contributing.

---

## 1. Vision

AURA is becoming the **system of record and system of reasoning for the
workforce** — the place where a company's people, time, pay, and statutory
obligations are not just stored but *understood*.

An HRIS records what happened. AURA aims to also answer *why*, *what changes if*,
and *what happens next* — correctly, for a specific company, in a specific
country, as of a specific date. The long-term destination is a platform where
every workforce decision (a policy change, a pay run, a compliance filing) is
configured once in plain language, versioned, dated, explained before it takes
effect, and auditable forever after — and where an AI layer can reason over all
of it without ever being the thing that silently changes it.

We are not building a bigger form. We are building the authoritative, explainable
backbone that a finance or HR leader can trust with decisions that have legal and
financial consequences.

---

## 2. Mission

**Problem.** Workforce software forces a false choice: rigid systems that can't
fit how a company actually operates, or flexible systems that become
unauditable, unexplainable messes where no one can say why payroll produced a
number. Both fail the moment money and compliance are on the line, and both fail
hardest for multi-entity, multi-country organizations.

**Who we serve.** HR and payroll administrators who are accountable for accuracy
but are not engineers; finance leaders who must trust the numbers; compliance
officers who must prove what rule applied and when; and the employees on the
other side of every one of those decisions.

**Why we exist.** To make correct, compliant, explainable workforce operations
achievable without a consulting army — safe for a five-person company and a
multi-entity enterprise alike, in one country today and many tomorrow.

---

## 3. Product Philosophy

**Enterprise first.** We optimize for correctness, auditability, and multi-tenant
safety before convenience. A feature that is delightful but cannot be trusted with
payroll is not shippable. We would rather ship one category that is fully safe than
ten that look functional.

**Explainable before automated.** Automation without explanation is a liability in
a domain with legal consequences. Before AURA does something automatically, a human
must be able to understand what it will do and why. We automate the mechanics, never
the accountability.

**Configuration over customization.** Companies express their differences by
*configuring* typed, validated, versioned settings — not by forking behavior into
bespoke code paths. Configuration is data the platform understands and can reason
about; customization is code the platform cannot. See §8.

**Safe by default.** The default state of every action is the cautious one. Access
is denied until granted. Changes are drafts until published. Nothing goes live the
instant it is edited.

**Human approval for critical operations.** Anything that moves money, changes pay,
or files with a government requires a person to approve it. The system prepares,
validates, and explains; a human commits.

**Immutable history.** What happened, happened. Audit records are append-only and
enforced as such at the database level, not merely by convention. History is never
edited to look cleaner.

**Tenant isolation.** One customer's data is invisible and unreachable to another,
enforced in every query, not assumed from a filter someone remembered to add.

**AI assists but never silently changes business data.** AI is a reasoning and
explanation layer over the system. It never has a write path to authoritative
business data. See §6.

---

## 4. Engineering Principles

**Simplicity over cleverness.** The reader of the code matters more than the writer.
A junior engineer should be able to follow a payroll calculation or an authorization
check without a whiteboard. Clever code that saves five lines and costs an hour of
comprehension is a net loss in a system that must be auditable.

**Additive evolution instead of rewrites.** We extend; we do not replace. New
capabilities are added alongside existing, tested behavior rather than rewriting it.
The configuration platform did not modify the People audit pipeline — it reused it.
Rewrites discard proven correctness and reintroduce solved bugs; in a compliance
system that is unacceptable.

**Composition over inheritance.** Behavior is assembled from small, explicit,
independently testable parts wired together at a composition root — not inherited
through hierarchies that hide where behavior comes from. Explicit wiring is
greppable; inheritance is archaeology.

**Domain-driven design.** The code speaks the language of HR and payroll —
definitions, versions, effective dates, drafts, tenants, permissions — not the
language of frameworks. When a payroll expert and an engineer read the same term,
it means the same thing.

**Stable public contracts.** The boundaries other code depends on — repository
ports, command contracts, resolver signatures — are treated as promises. We change
them deliberately and additively, because the whole platform is designed to let
future modules build on them without renegotiation.

**Explicit boundaries.** What may depend on what is stated and *enforced*, not left
to discipline. Client code cannot import server write-runtime; the browser cannot
construct trusted identity; domain commands cannot reach the database directly.
These boundaries are verified by architecture-fitness tests that fail the build, not
by review vigilance alone.

**Avoid speculative abstractions.** We do not build frameworks for modules that do
not exist. An extension point designed against zero implementations encodes guesses
that do not survive contact with reality. We build the concrete thing first.

**Rule of three before generalization.** A pattern earns an abstraction on its third
real occurrence, not its first anticipated one. Two similar things are a coincidence;
three are a pattern worth naming. Generalizing earlier optimizes for a future we
cannot yet see clearly.

---

## 5. Product Principles

Every module should feel like it was designed by someone who respects that the user
is accountable but not technical.

**Guided instead of overwhelming.** Show the next right step, not every possible
option at once. A new tenant is led through setup, not dropped into a wall of empty
forms.

**Clear status instead of arbitrary scores.** State is communicated in words a person
can act on — *Ready*, *Needs attention*, *Scheduled change* — never a gamified number
that invites "why 73 and not 74." Status must always answer "what do I do about it?"

**Explain every important action.** Before a consequential action, the user
understands what will happen, who is affected, and when it takes effect. Especially
before anything is published or made live.

**Configuration should be understandable.** Settings read as plain language with
purpose, not as raw database fields. The user should know what a setting means, where
it is used, and what changing it affects.

**Errors should teach.** An error names the field, states the problem in plain
language, and points toward the fix. It never leaks internal detail and never blames
the user for the system's ambiguity.

**Every workflow should be auditable.** The user can always answer "who changed this,
when, and to what?" — because the system recorded it immutably as it happened.

---

## 6. AI Principles

AI is a first-class part of AURA's vision and a permanently constrained one. These
rules do not expire.

**AI may:**

- **Explain** — what a setting does, why a number came out the way it did, what a
  policy means.
- **Recommend** — surface likely-better configurations, flag inconsistencies,
  suggest next steps.
- **Summarize** — turn history, audit trails, and state into human-readable
  narratives.
- **Assist** — draft, pre-fill, and guide, always leaving the final action to a
  human.

**AI may never:**

- **Silently publish** — AI never moves a draft to live. Publishing is a human
  decision with a human's name on it.
- **Bypass approval** — AI cannot route around the draft→review→publish flow or any
  human-approval gate.
- **Modify payroll or alter financial data** — AI has no write path to pay, money, or
  statutory figures. None.
- **Impersonate users** — AI acts as itself, through read models, never under a user's
  identity or authority.

**Why.** In a domain with legal and financial consequences, accountability must
attach to a person. An AI that can silently change business data is an
unauditable, unaccountable actor in a system whose entire value is auditability and
accountability. We get the leverage of AI reasoning *and* keep every consequential
change attributable to a human — by architecture, not policy. AI consumes read
models; it never holds a write handle.

---

## 7. Security Principles

Philosophy, not implementation. The implementations change; these do not.

**Least privilege.** Every actor — human, service, or AI — has the minimum access
its role requires and nothing inherited "for convenience." Permissions are specific,
not coarse buckets.

**Immutable audit.** The record of what happened cannot be altered or deleted,
enforced at the lowest level available, so that the audit trail is evidence, not a
log someone could have edited.

**Verified identity.** Who a request is from is established by the trusted server, from
a verified session — never asserted by the browser. Identity, tenant, roles, and
permissions are resolved server-side and are never accepted from the client.

**Explicit authorization.** Every protected operation checks authorization itself,
server-side, deny-by-default. A UI that hides a button is a courtesy; it is never the
control. An unregistered operation is denied, not assumed safe.

**Secure by default.** The safe configuration is the one you get without doing
anything. Sessions are httpOnly/Secure. Secrets never appear in logs. Failing closed
is the default failure mode.

---

## 8. Configuration Philosophy

**Why configuration exists.** Companies genuinely differ — in time zones, currencies,
work weeks, pay rules, and statutory obligations. AURA absorbs that difference as
*configuration*: typed, validated data the platform understands, reasons about, and
audits. This is what lets one codebase serve a Manila startup and a multi-entity
enterprise correctly.

**Configuration vs. customization.** Configuration is structured data the platform
comprehends — it can validate it, version it, explain it, and compute from it.
Customization is bespoke behavior the platform cannot reason about and cannot
guarantee. We choose configuration because a compliance system must be able to
*answer for* every rule it applied; it cannot answer for a fork. When a company needs
something configuration cannot yet express, the answer is to extend the typed
configuration model — deliberately — not to special-case behavior in code.

**Why versioning matters.** A workforce rule is not a current value; it is a history
of values. "What was our overtime policy last March" is a question a payroll dispute,
an audit, or a back-computation will ask. Configuration is versioned because the past
must remain answerable, immutably, after the present has moved on.

**Why effective dating matters.** Business rules change on dates chosen by humans and
constrained by law — not the moment someone clicks save. A minimum-wage change takes
effect on a legislated date; a new pay policy applies from the next cycle. Effective
dating separates *when a change is decided* from *when it takes force*, so a version
can be prepared and scheduled ahead of time and resolved correctly for any past,
present, or future date.

**Why draft/publish exists.** Configuration that goes live the instant it is typed is
unsafe in a system where a wrong value mispays real people. The draft→review→publish
lifecycle makes every consequential change a deliberate, reviewable, explainable,
human-approved act — with a chance to see what will happen before it does, and an
immutable record after.

---

## 9. UX Philosophy

AURA's primary users are HR and payroll professionals: accountable, expert in their
domain, and not engineers. The experience is built for them.

**Predictable.** The same action behaves the same way everywhere. Draft, review,
publish, and history feel identical across every category, so learning one module
teaches all of them.

**Explainable.** The interface never asks the user to trust a black box. What a setting
means, who a change affects, and when it takes effect are visible before commitment.

**Discoverable.** Capability is findable without training. Status surfaces what needs
attention; the next step is shown, not hunted for.

**Accessible.** Keyboard-navigable, properly labeled, semantically structured, and never
reliant on color alone to convey meaning. Accessibility is a correctness requirement,
not a polish pass.

**Enterprise-grade.** Calm, dense where it should be, and free of gimmicks. It should
feel like a tool a finance team relies on daily — not a consumer app, and never a raw
database admin panel.

---

## 10. Future Platform Direction

Direction, not a plan. Each layer builds on the ones before it, reusing the same
foundation — configuration, versioning, effective dating, audit, and human approval —
rather than reinventing them.

**Configuration** is the foundation: the tenant-safe, versioned, effective-dated,
auditable substrate every later capability stands on.

**Organization** gives that configuration a shape to attach to — legal entities,
departments, structure — so settings and policies can be scoped and inherited rather
than flat.

**Attendance** turns configured rules and organizational structure into observed
reality: time, presence, and the raw material payroll consumes.

**Payroll** computes consequences from all of the above — configured policy, structure,
and attendance — under strict human approval, because this is where money moves.

**Compliance** ensures those consequences satisfy country-specific statutory
obligations, expressed as configuration extensions rather than forked code.

**AI** reasons across the entire stack — explaining, recommending, and summarizing —
as a reader of everything and a silent writer of nothing.

The order matters: each layer depends on the correctness of the one beneath it, and no
layer is built before its foundation is trustworthy.

---

## 11. Non-Negotiables

These are permanent. Violating one is not a trade-off to weigh; it is a defect. They
change only by amending this constitution with a version bump and a deliberate,
recorded decision.

1. **Immutable audit.** Business history is append-only and enforced as such at the
   data layer. It is never edited or deleted.

2. **No silent AI changes.** AI never writes authoritative business data and never
   performs a consequential action without human approval.

3. **Tenant isolation.** Cross-tenant access is impossible by construction, enforced in
   every data path — never dependent on a remembered filter.

4. **Effective-dated business rules.** Rules that affect pay, compliance, or workforce
   outcomes are versioned and effective-dated. The past stays answerable; the future can
   be scheduled.

5. **Human approval for financial operations.** Anything that moves money, changes pay,
   or files statutorily requires a human to approve it. The system prepares and explains;
   a person commits.

6. **Verified server-side identity and authorization.** Identity, tenant, roles, and
   permissions are resolved and enforced by the trusted server, deny-by-default. The
   client never asserts authority.

7. **Backward compatibility.** We evolve additively. Established contracts and data are
   not broken by new work; migrations are forward-only and safe.

8. **Configuration, not forked behavior.** Company-specific difference is absorbed as
   typed, validated configuration — never as bespoke code paths the platform cannot
   reason about or audit.

---

*End of Version 1.0. Amendments require a version bump and a recorded decision. This
document governs; the code conforms to it.*
