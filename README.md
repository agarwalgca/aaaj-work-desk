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

## Conventions

See [CLAUDE.md](./CLAUDE.md) — file layout, naming, design tokens, and the
checklist for adding a table across Postgres, Dexie and the outbox.

## Build status

- [x] **1 — Foundation.** Scaffold, tokens, fonts, logo and icons, Supabase
      wiring, app shell, login screen.
- [ ] 2 — Data layer: migrations, seed, RLS, Dexie, outbox, pull, pruner, flusher.
- [ ] 3 — Features: My Work, Board, job detail, job form, Clients, Team, Settings.
- [ ] 4 — PWA and hardening.
