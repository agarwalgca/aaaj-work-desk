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
| `npm run verify:live`| Cache window, reassignment and conflict path, against the real project (mutates seed data and puts it back) |

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

**A repair the seed has to do.** `seed.sql` inserts into `auth.users` directly,
because that is the only way to create accounts with known passwords from SQL. That
leaves GoTrue's token columns NULL, and GoTrue reads them into Go strings — so
every password sign-in for a seeded account fails with *"Database error querying
schema"* before the password is even checked. The seed coerces them to `''`; if you
ever hand-insert an account, do the same.

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

## Installing and offline

The service worker precaches the app shell — HTML, JS, CSS, the self-hosted fonts
and the icons — so opening Work Desk with no connection lands on a working
interface rather than a browser error. Every navigation is answered from that
cache and React Router takes over, which means a deep link opened offline reaches
the right screen.

Supabase is explicitly never cached (`NetworkOnly`). Reads come from Dexie and
writes go through the outbox; a cached POST would be a write that looked like it
worked and did not.

A new version is offered in a bar, never applied. Taking over in the background
reloads the tab, and the tab is where somebody is halfway through a comment.

**Verifying installability.** Lighthouse dropped its PWA category in v12, so there
is no audit to run any more. Chrome DevTools → Application → Manifest is the
replacement: it lists the manifest fields and reports any installability error.
What has to hold is a manifest with name, short name, `start_url`, `display:
standalone` and 192px + 512px icons; a registered service worker with a fetch
handler; and a secure context. All of those are in place and were checked against
Chrome.

Service workers are per **origin**, not per project. Another local app previously
served on the same port will keep controlling it until unregistered — clear it in
DevTools → Application → Service workers if a stale one appears.

## Conventions

See [CLAUDE.md](./CLAUDE.md) — file layout, naming, design tokens, and the
checklist for adding a table across Postgres, Dexie and the outbox.

## Build status

- [x] **1 — Foundation.** Scaffold, tokens, fonts, logo and icons, Supabase
      wiring, app shell, login screen.
- [x] **2 — Data layer.** Migration, seed, RLS and triggers, Dexie schema, outbox,
      pull cursor, reconcile sweep, flusher, sync chip.
- [x] **3 — Features.** My Work, Board, job detail, job form, Clients, Team,
      Settings, global search, role gating.
- [x] **4 — PWA and hardening.** Manifest, service worker, install prompt,
      offline cold launch, update prompt, error boundary, keyboard navigation.
