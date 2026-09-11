# AAAJ Work Desk — working conventions

Internal work-allocation PWA for **A A A J & Associates**, Chartered Accountants.
Partners and managers assign client jobs to staff and track them to completion.
8–20 users, phones at client premises on bad data, desktops in office.

Supabase plus the browser is the whole architecture. There is no backend server.

## Stack and the boundaries around it

React 19 + TypeScript + Vite 8 · Tailwind CSS v4 · Supabase (Postgres, Auth, RLS,
Realtime, `ap-southeast-1`) · Dexie (IndexedDB) · React Router v8 · Zustand for
UI-only state · `vite-plugin-pwa` (`injectManifest`) · Vitest.

Do **not** add: Redux, Next.js, an ORM over Supabase, MUI/Chakra/shadcn, a sync
library such as Replicache, or a backend server. Radix primitives only where a
component genuinely needs focus management we would otherwise hand-roll.

Out of scope for Phase 1 and not to be scaffolded for: timesheets, billing,
compliance calendars, document storage, a client portal, notifications, charts,
recurring-job templates, multi-firm tenancy. If one of these looks necessary,
stop and say so rather than building it.

## Decisions taken while building (each reversible, none free)

- **React 19, not 18.** `create-vite` ships 19; pinning back buys nothing. Uses the
  React 19 context form (`<AuthContext value={…}>`, `use(AuthContext)`).
- **Tailwind v4 via `@tailwindcss/vite`.** No `tailwind.config.js`; the theme is
  declared in CSS. See "Design tokens".
- **React Router v8, `<BrowserRouter>` with element routes**, not a data router.
  Dexie is the read source, so loaders would have nothing to load.
- **Icons are hand-drawn SVGs** in `src/components/icons.tsx`. The app needs about
  six; an icon package is more bytes and more indirection than that earns.
- **`npx tsc --noEmit` is a no-op here** because `tsconfig.json` is a solution file.
  Use `npm run typecheck` (`tsc -b --force`).
- **Role gating in the client is presentation only.** `RequireRole` and the nav
  filter hide screens; Postgres refuses the same people regardless. A `useMe()` of
  `undefined` means the profile has not synced yet and must be waited for, not
  treated as least privilege, or a partner watches their own Board flicker away on
  every cold start.
- **Forms take their initial values as props, keyed by row id**, rather than
  copying a loaded row into state inside an effect. The effect version renders
  twice on every open and races anyone who starts typing before Dexie answers.
- **Class names for status colours are written out in full** in
  `src/components/statusStyles.ts`. Tailwind reads source text, so
  `border-status-${status}` is a class that never gets generated.
- **A reconcile sweep, not just a cursor.** An incremental pull can only add and
  update; it cannot say that a row has *left* a device's view, which is what
  happens every time a manager reassigns a job away from someone. After each pull,
  one id-only query per table lists what the caller may currently see, and local
  rows missing from that list are deleted. It covers reassignment, tombstones and
  the financial-year window shifting, all with the same few lines.
- **The migration is verified locally before it is applied.** `npm run verify:sql`
  runs `0001_init.sql` and `seed.sql` against Postgres compiled to WASM (PGlite),
  with a stub `auth` schema, and asserts the permission rules. Dev-only; it never
  ships. `scripts/test-rls.ts` re-checks the same rules through PostgREST once the
  migration is live.
- **Sign-in is by username, not email.** `profiles.username` is a column of its own,
  unrelated to the account's email address. Supabase Auth is keyed by email, so the
  login screen bridges the two through `public.email_for_username(p_username text)`
  — SECURITY DEFINER, executable by `anon`, returns null for an unknown, inactive or
  soft-deleted username. Wrong username and wrong password produce the same message,
  so the form is not an oracle; the function does return a known username's email to
  its caller, which would take a server to avoid and Phase 1 has none.

## File layout

```
brand/                  authored monogram SVGs (generated from the font, committed)
scripts/                node scripts: icon generation, RLS assertions, seeding
public/icons/           generated PWA icon set — do not hand-edit
src/
  app/                  App, router, Shell, AuthProvider — the frame, not features
  components/           shared presentational primitives, no data access
  features/<area>/      one folder per screen area (auth, jobs, clients, team, settings)
  lib/                  supabase client, Dexie db, sync (pull/outbox/prune), helpers
  styles/               tokens.css (raw values) + index.css (fonts, Tailwind theme)
```

A component that reads or writes data lives under `features/`. Anything under
`components/` takes props and renders. Anything that touches Supabase or Dexie
lives under `lib/` and is imported by feature code, never by `components/`.

## Naming

- Files: `PascalCase.tsx` for components, `camelCase.ts` for everything else.
- Exports: named, never default — one obvious symbol per file.
- Database and Dexie: `snake_case`, identical column names across both. No mapping
  layer; a `jobs` row in Postgres and in Dexie are the same shape.
- Status and role values are the Postgres enum strings verbatim
  (`not_started`, `in_progress`, …). Never a display string in storage.

## Design tokens

`src/styles/tokens.css` holds every colour, radius and font stack as plain custom
properties. `src/styles/index.css` maps them into Tailwind's theme with
`@theme inline`, so `--ink` is reachable both as `var(--ink)` and as `bg-ink`,
`text-ink`, `border-ink`.

Never write a hex value outside `tokens.css`. If a colour is missing, add a token.

Geometry: `rounded-card` (6px) on cards, `rounded-control` (4px) on inputs and
pills. 1px `border-rule` on every surface — borders, not shadows. Shadows are
reserved for modals and the mobile action sheet. 8px spacing scale, dense rows.

Type: `font-serif` (IBM Plex Serif 600) for the wordmark and page titles,
`font-sans` (IBM Plex Sans 400/500/600) for UI, `font-mono` (IBM Plex Mono,
tabular figures) for every date, count and identifier. Fonts are self-hosted
latin subsets via `@fontsource`; add a weight by importing it in `index.css`.

The monogram is regenerated from the shipped font file with `npm run icons`,
which writes `brand/*.svg` and `public/icons/*`. Both are committed; do not edit
the outputs by hand.

## Adding a table across Postgres + Dexie + outbox

1. **Migration** — `supabase/migrations/<timestamp>_<name>.sql`. Every table gets
   `id uuid primary key default gen_random_uuid()`, `created_at`, `updated_at`
   (shared trigger), `deleted_at` for tombstoned soft deletes. Never hard-delete;
   the pull relies on tombstones to remove rows that have left a user's scope.
2. **RLS** — enable it, write policies against `public.current_role()`, the
   SECURITY DEFINER helper. Policies on `jobs` must never select from `profiles`
   directly or they recurse. Column-level and transition-level rules go in a
   `BEFORE UPDATE` trigger; RLS cannot express them.
3. **Dexie** — bump the version in `src/lib/db.ts` and add the store with the same
   column names. Index whatever the screens filter on, plus `updated_at`.
4. **Pull** — add the table to the cursor list; it is pulled with
   `updated_at > last_pulled_at`, tombstones included, ordered by `updated_at`,
   paged at 500.
5. **Write path** — mutations write to Dexie first, then append an `outbox` row
   `{ id, table_name, op, row_id, payload, client_updated_at, attempts, last_error }`.
   UUIDs are generated on the client so a retried insert is idempotent.
6. **Pruner** — decide what keeps the row in cache. The window is state-shaped, not
   age-shaped: open jobs always, closed jobs only within the current or previous
   Indian financial year (1 Apr – 31 Mar), computed at pull time.
7. **Assertions** — add the new permission cases to `scripts/test-rls.ts`.

Append-only tables (`job_status_history`, `job_comments`) push as
`upsert … on conflict (id) do nothing` and are never updated or deleted.

## Verification before saying something works

Run it and quote the output. Do not report a step done on the strength of having
written the code.

- `npm run typecheck`, `npm run lint` and `npm run build` clean.
- `npm test` — unit tests (Vitest, Dexie against fake-indexeddb).
- `npm run verify:sql` — migration and seed applied to PGlite, permissions asserted.
- `node --experimental-strip-types scripts/test-rls.ts` — the same rules through
  PostgREST, against the live project.
- Offline write path, cache window, reassignment tombstone, conflict path and
  reload durability are checked by hand against the steps in the README.

## Commits

One commit per build step, present-tense subject under 72 characters, scoped:

```
feat(shell): app frame, brand tokens and login against live auth
```

Scopes in use: `shell`, `data`, `sync`, `jobs`, `clients`, `team`, `settings`,
`pwa`, `build`. Body explains why when the diff does not.

## Firm-specific facts

Ask rather than invent — real client names, the categories the firm actually
uses, the exact wording of a status. `seed.sql` uses obviously fictional clients
until told otherwise.

Established so far:

- **Sign-in is username + password only.** No magic link. Email addresses exist on
  the account for one purpose: the forgotten-password reset, which lands on
  `/reset-password`. That path needs custom SMTP configured on the project —
  Supabase's built-in sender only delivers to project members and is capped at a
  couple of messages an hour — and the redirect URL has to be allowlisted under
  Authentication → URL Configuration.
- **Usernames are stored lowercase** and matched case-insensitively;
  `email_for_username` lowercases its argument. Display names come from
  `profiles.full_name`, never from the username.
- The partner account is `gaurav@aaaj.co.in`, username **`nitesh`**.
- **Staff status transitions**, as implemented in `public.jobs_guard()`:
  `not_started → in_progress`, `in_progress ⇄ on_hold`, `in_progress → review`,
  `on_hold → review`, `rework → in_progress`. The brief wrote this as a chain, so
  `on_hold → in_progress` was added to let someone resume work they paused — check
  that is what the firm wants before it matters.
- Seeded colleagues live at `@seed.aaaj.co.in`, which routes nowhere. Remove them
  before the firm goes live: `delete from auth.users where email like '%@seed.aaaj.co.in';`
