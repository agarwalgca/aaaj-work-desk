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

- `npm run typecheck` and `npm run build` clean.
- `node --experimental-strip-types scripts/test-rls.ts` — pass/fail per permission case.
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
