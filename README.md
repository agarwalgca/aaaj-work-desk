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
2. `supabase/migrations/0002_job_templates.sql` — recurring job templates, plus the
   two columns on `jobs` recording which template and period a job came from.
   Re-runnable.
3. `supabase/migrations/0003_generate_recurring.sql` — the financial-year period
   functions and the monthly schedule that creates recurring jobs. **Enable
   `pg_cron` first** (Database → Extensions), or the file applies without
   scheduling anything and says so. Re-runnable.
4. `supabase/migrations/0004_due_date_rules.sql` — the optional due-date rule on a
   template, and the arithmetic behind it. Re-runnable.
5. `supabase/migrations/0005_schedule_status.sql` — lets the app check that the
   monthly schedule actually exists. Re-runnable.
6. `supabase/migrations/0006_categories_employees_approval.sql` — categories as
   editable rows, a client's categories, adding an employee from the app, and
   completion as an approval. Re-runnable.
7. `supabase/seed.sql` — three fictional clients, six people and twenty-five jobs.
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

## Categories, employees and approval

**Categories** are managed by partners and managers on the Categories screen, with
no deploy. Each has a name and what it is usually measured in — which decides the
period a new job opens on. A category in use is retired rather than deleted: it
leaves the forms, and jobs and clients already under it keep it. Clients carry
several, and the Clients screen filters by any one of them.

**Employees** are added by a partner on the Team screen — name, username, email,
role and a starting password — and can sign in straight away. They change the
password under Settings. This needs a connection: it is the one write that is not
saved to the device first, because a password must never be stored on it.

**Completion is an approval.** A job reaches Completed only from Review, and the
job records who approved it and when. A manager approves staff work; a manager's
own job, or another manager's, is approved by a partner; a partner can approve
anybody's. Staff see "Waiting for approval" once their part is done; the reviewer
sees Approve and Send back.

## Recurring work

A template says "this client has a GST return every month, and Kavya does it".
Frequencies are monthly, quarterly, half-yearly and annual, and all of them are
financial-year shaped: Q1 is Apr–Jun, H2 ends on 31 March, and a period reads
`Aug-2026`, `Q2 FY 2026-27` or `FY 2025-26`.

Jobs appear by themselves at 00:20 UTC on the 1st of each month — just before
06:00 in India, so the work is waiting before anybody opens the app. That is
`pg_cron` running `generate_recurring_jobs()` inside Postgres, not a server.

The period generated is the one that has just **ended**: 1 October produces
September's GST return, and 1 April produces the audit for the financial year
just closed. That is also what lets a single monthly schedule serve every
frequency — on 1 August a quarterly template's quarter has not finished, so
nothing is created; on 1 October it has.

A manager can still open **Recurring** and press Generate to catch up a missed
period or create one early. Either way, anything already generated is listed as
such and skipped, so August cannot end up with two sets of returns.

The financial-year arithmetic exists twice: in `periods.ts` for the app and in
`period_for()` for the schedule. `npm run verify:sql` compares the two across 212
date-and-frequency combinations, because two implementations of one rule is
exactly the kind of thing that drifts quietly.

### Due dates

A template can carry a due-date rule, stated the way a deadline is spoken: *the
20th, the month after the period ends*. Generated jobs get that date, and the form
works the rule through on real periods as you set it — `Aug-2026 → due 20 Sep
2026` — so an off-by-one is caught before thirty jobs carry it. The 31st of a
30-day month becomes the 30th rather than rolling into the next.

**This is the firm's own figure and nothing else.** The app ships no statutory
dates, holds no compliance master, and knows nothing about the law. If a deadline
moves, a partner changes one rule and every future job follows; every individual
job stays editable. That distinction is the reason a due-date rule is in and a
compliance calendar is still out — the firm asserts the date, never the software.

Leave the day blank and jobs are created undated. A date typed on the Generate
panel overrides every rule for that batch.

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

## A limitation worth knowing about

Browsers evict site storage. iOS Safari clears it after roughly seven days without
a visit, and installing to the home screen only partly mitigates that. Nothing in a
browser can prevent it.

What that means here: somebody who ignores the app for three weeks and then opens
it offline may find an empty cache and no jobs. Worse, writes queued on that device
and never flushed before the eviction are gone — not queued somewhere else, gone.

The app does what it can:

- the outbox is flushed whenever the tab is hidden and whenever a connection
  returns, so the window in which a write is only on the device is as short as it
  can be made;
- signing out is blocked with a warning while anything is still queued;
- a banner appears when a queued write has been waiting more than a day.

None of that helps a phone that is never opened. If a member of staff works offline
regularly, the honest advice is to open the app on Wi-Fi once a week. This is a
real constraint of building without a backend, not an oversight, and it is the main
thing that would change if Phase 2 ever adds one.

## Who sees what

| Screen      | Partner | Manager | Staff |
| ----------- | ------- | ------- | ----- |
| My Work     | ✓       | ✓       | ✓     |
| Board       | ✓       | ✓       | —     |
| New / edit job | ✓    | ✓       | —     |
| Job detail  | ✓       | ✓       | own jobs only |
| Reassign    | ✓       | ✓       | —     |
| Clients     | ✓ edit  | ✓ edit  | read  |
| Recurring   | ✓       | ✓       | —     |
| Categories  | ✓       | ✓       | —     |
| Add employee | ✓      | —       | —     |
| Approve completion | ✓ | ✓      | —     |
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

## Deploying

Pushing to `master` builds and publishes to GitHub Pages. The workflow runs the
same checks as a local commit first — typecheck, lint, unit tests and the SQL
assertions — so a red build never reaches the demo URL.

Pages serves a project site from `/<repo>/` rather than the domain root, so the
build takes `VITE_BASE` and everything downstream reads it: Vite's asset paths,
the router's `basename`, and the manifest's `start_url` and `scope`, which are
relative for exactly this reason. Pages also has no server to rewrite unknown
paths onto the app, so the build writes `dist/404.html` as a copy of the shell —
that is what makes a deep link work on a first visit, before the service worker
is installed.

Two repository variables have to be set (Settings → Secrets and variables →
Actions → Variables): `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Both are
public by design — the anon key is meant to be in the bundle, and every table is
guarded by RLS.

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
