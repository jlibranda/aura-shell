# AURA — Application Shell (Sprint 1 · Epic 1)

The complete, reusable application shell every future AURA module plugs into.
This build is **UI only**: no backend, no database, no business logic, and no
real payroll calculations. Every widget and page renders realistic placeholder
content so the shell already feels like a modern enterprise SaaS product.

## Requirements

- Node.js **18.18+** (or 20+)
- npm (or pnpm / yarn)

## Run it

```bash
npm install
npm run dev
```

Then open **http://localhost:3000**. You'll land on the login screen — sign in
(any input works; auth is mocked) and you're in the app at `/home`.

Other scripts:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run typecheck  # tsc --noEmit
```

## What's included

- **Global + protected layouts** with an always-present sidebar and top bar.
- **Auth screens (UI only):** login, forgot password, reset password.
- **Left sidebar** with sections, active state, collapse (persisted), and a
  responsive drawer on mobile.
- **Top bar:** entity switcher, global search, ⌘K palette trigger, Copilot,
  notifications, theme toggle, and user menu.
- **Command palette (⌘K / Ctrl+K):** keyboard-driven navigation + actions.
- **Global search** with grouped placeholder results (press `/`).
- **Notification center** (placeholder) with an unread badge.
- **AI Copilot dock** (UI only) — opens with ⌘J or the top-bar button.
- **Executive dashboard** with eight placeholder widgets: Upcoming Payroll,
  Headcount, Attendance, Leave Summary, Labor Cost, Compliance Deadlines,
  AI Insights, Recent Activity.
- **Theme system:** Light / Dark / System, persisted, applied before paint.
- **Breadcrumbs**, responsive layout, and empty pages for all nine modules
  (Home, People, Payroll, Time, Leave, Benefits, Reports, Copilot, Settings).

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | Open the command palette |
| `/` | Open global search |
| `⌘J` / `Ctrl+J` | Toggle the Copilot dock |
| `Esc` | Close any overlay |

## Tech

Next.js 14 (App Router) · TypeScript · Tailwind CSS · Zustand · lucide-react.

The command palette, overlays, dropdowns, tooltips, and theme system are
hand-rolled (no `cmdk` / `radix` / `next-themes`) so the shell is self-contained
with no fragile external API surface. The design system is a set of CSS-variable
tokens in `src/app/globals.css`, mapped to utilities in `tailwind.config.ts`, so
a single token drives both light and dark themes.

## What's mocked (and replaced later)

- **Authentication** — `src/stores/auth-store.ts` is a client-only flag in
  `localStorage`. There is no credential check. A real auth epic replaces it.
- **All data** — everything in `src/lib/mock-data.ts` (user, entities,
  notifications, search results, widget figures) is placeholder.
- **Copilot** — the dock is visually complete but inert; sending a message
  shows a static "coming soon" reply. No AI calls are made.

## Notes vs. the approved plan

Two deliberate, plan-consistent decisions:

1. **Dependencies** were kept to a minimal, reliable set and the palette /
   overlays / theme were hand-rolled instead of pulling in `cmdk` / `radix` /
   `next-themes`.
2. **Primitives were consolidated.** The plan listed ~28 one-per-file
   primitives; they're grouped here into `button.tsx`, `primitives.tsx`,
   `form.tsx`, and `overlay.tsx`. Same components, fewer files. All other
   structure follows the plan.

## Acceptance criteria — status

- [x] App launches locally; `/` redirects to `/home` when authenticated.
- [x] All nine module routes render inside the protected layout.
- [x] Sidebar highlights the active module; collapse works and persists.
- [x] Breadcrumbs reflect the current route.
- [x] Consistent, polished empty states for every non-Home module.
- [x] Login / forgot / reset screens with validation UI states.
- [x] Sign in enters the app; sign out returns to `/login`; guard redirects.
- [x] ⌘K palette opens anywhere; Esc closes; navigates on select.
- [x] Global search opens with grouped placeholder results.
- [x] Copilot dock opens/closes; composer + seeded prompts; static reply only.
- [x] Notifications panel with placeholder items and unread badge.
- [x] Dashboard renders all eight widgets responsively; no business logic.
- [x] Light / Dark / System all work; system tracks OS; no flash on load.
- [x] Responsive to mobile; sidebar becomes an overlay drawer.
- [x] Overlays keyboard-accessible; visible focus; reduced motion respected.

---

© 2025 AURA · Sprint 1 / Epic 1 — Application Shell.
