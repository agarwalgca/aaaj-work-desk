# AAAJ Work Desk

Internal work-allocation app for **A A A J & Associates**, Chartered Accountants.
Partners and managers assign client jobs to staff and track them to completion.
Offline-first PWA: React + Vite on the front, Supabase for Postgres, auth and
realtime, Dexie for the local store and write outbox.

## Running it

```bash
npm install
cp .env.example .env      # fill in VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
npm run dev
```

Without a `.env` the app renders setup instructions rather than a dead login form.

| Script              | Does                                              |
| ------------------- | ------------------------------------------------- |
| `npm run dev`       | Vite dev server on :5173                          |
| `npm run build`     | Typecheck then production build                   |
| `npm run typecheck` | `tsc -b --force` (plain `tsc --noEmit` is a no-op) |
| `npm run lint`      | oxlint                                            |
| `npm run icons`     | Regenerate the monogram SVGs and PWA icon set     |
| `npm test`          | Unit tests (Vitest)                               |
| `npm run verify:sql`| Apply the migration and seed to a throwaway Postgres and assert the permission rules |

## Access

Invite-only. Public sign-up is disabled in Supabase; a partner creates the account
and a trigger adds the matching `profiles` row as `staff` for a partner to adjust.
Roles are `partner`, `manager`, `staff`; what each may do is enforced in Postgres
by row-level security plus a `BEFORE UPDATE` trigger, not in the client.

People sign in with a **username**, which is a column on `profiles` and has nothing
to do with their email address. Supabase Auth is keyed by email, so the login screen
resolves one to the other through `public.email_for_username()`.

Sign-in is username and password only. An account's email address exists for one
reason: the forgotten-password reset, which mails a link that lands on
`/reset-password`. Two things have to be set up on the Supabase project for it to
work — custom SMTP (the built-in sender only delivers to project members and is
rate-limited to a couple of messages an hour) and the redirect URL allowlisted
under Authentication → URL Configuration. Until then a partner sets a new password
from the dashboard (Authentication → Users → ⋯ → Reset password).

## Setting up the database

Run these once, in the Supabase SQL editor, in order:

1. `supabase/migrations/0001_init.sql` — tables, enums, triggers, RLS, the
   username lookup, and the `auth.users` → `profiles` trigger. Re-runnable.
2. `supabase/seed.sql` — three fictional clients, six people and twenty-five jobs.
   Development data. It expects the partner account (`gaurav@aaaj.co.in`) to exist
   already and will stop with a clear message if it does not.

Both are checked locally first with `npm run verify:sql`, which runs them against
Postgres compiled to WASM and asserts that staff cannot complete a job, managers
cannot delete one, and so on. After applying them, `node --experimental-strip-types
scripts/test-rls.ts` re-checks the same rules through the real API.

The seeded colleagues live at `@seed.aaaj.co.in`, a subdomain that routes nowhere.
Before the firm goes live:

```sql
delete from auth.users where email like '%@seed.aaaj.co.in';
```

## How syncing works

Dexie is the read source for every screen, online included — the UI never waits on
the network to paint. Writes go to Dexie first and queue in an outbox that drains
in order, with exponential backoff, whenever there is a connection. A refusal the
server will simply repeat (an RLS rejection, a constraint violation, a job
reassigned away mid-edit) is marked failed and surfaced in the sync panel rather
than retried forever.

Which jobs live on a device is decided by state, not age: every open job however
old, plus closed jobs finished inside the current or previous Indian financial
year. The boundary is computed at pull time, so on 1 April the window moves by
itself.

## Who sees what

| Screen      | Partner | Manager | Staff |
| ----------- | ------- | ------- | ----- |
| My Work     | ✓       | ✓       | ✓     |
| Board       | ✓       | ✓       | —     |
| New / edit job | ✓    | ✓       | —     |
| Job detail  | ✓       | ✓       | own jobs only |
| Reassign    | ✓       | ✓       | —     |
| Clients     | ✓ edit  | ✓ edit  | read  |
| Team        | ✓       | —       | —     |

The nav and the controls follow this table, but it is courtesy rather than
security: every one of these rules is enforced again in Postgres, and the client
copy exists only so nobody is shown a door that will not open.

## Conventions

See [CLAUDE.md](./CLAUDE.md) — file layout, naming, design tokens, and the
checklist for adding a table across Postgres, Dexie and the outbox.

## Build status

- [x] **1 — Foundation.** Scaffold, tokens, fonts, logo and icons, Supabase
      wiring, app shell, login screen.
- [ ] 2 — Data layer: migrations, seed, RLS, Dexie, outbox, pull, pruner, flusher.
- [x] **3 — Features.** My Work, Board, job detail, job form, Clients, Team,
      Settings, global search, role gating.
- [ ] 4 — PWA and hardening.
