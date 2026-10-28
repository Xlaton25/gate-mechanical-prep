# GATE 2027 ME

Personal GATE Mechanical prep app for Satyam Majumder. **Early foundation — not a finished learning platform.**

Repo: https://github.com/Xlaton25/gate-mechanical-prep (`main`, public by owner's choice; synced with Lovable). No PDFs, keys or credentials are committed.

## Status
- Done: responsive UI shell with honest empty states; source inventory (26 PDFs, 859 pages, none verified); guest local-only settings.
- Done (milestone 1): schema + RLS (`db/`), server-only scoring (`src/server/scoring`), Asia/Kolkata study-day logic.
- Done (milestone 2): owned Supabase **GATE** linked; combined schema migration applied (see `docs/supabase.md`); `/auth` email/password sign-in/sign-up with confirmation state and sign-out; signed-in Settings persist daily minutes, timezone and reset time to `user_preferences`.
- Not verified: a real sign-up, confirmation email, sign-in and saved preference against GATE (automation created no accounts and sent no email); pgTAP on Supabase; live Netlify deploy.
- Done (milestone 3): `/practice` pilot practice — authenticated list/detail/submit server functions, server-side scoring with `gate-2026-v1`/`gate-2027-v1`, idempotent saves, solution only after save. No questions are imported yet, so it shows an honest empty state.
- Not verified live: a signed-in submission (no validated content and no automated sign-in on this external project). Live-checked: unauthenticated list/submit are rejected; RPC privileges.
- Not done: question import/validation, daily-10 scheduler, analytics, mocks, deployment.

## Commands
- `bun install`, `bun run dev`
- `bunx vitest run` — 109 unit tests (scoring, practice submit/UI, study day, server boundary, inventory, routing, preferences, auth)
- SQL rehearsal: `npm i @electric-sql/pglite` in a scratch dir, then `node db/tests/practice_submission.rehearsal.mjs`
- `tsgo --noEmit` — typecheck
- SQL tests: see `docs/supabase.md` (43 pgTAP checks; not yet run on Supabase)
- Netlify build independently run locally by Codex (Node 24/npm, commit 1d770f6), succeeded; live deploy not verified. `.netlify/` output is git-ignored.

## Docs
`docs/roadmap.md`, `docs/architecture.md`, `docs/supabase.md`, `docs/intake.md`, `docs/integration-checklist.md`.
