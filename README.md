# GATE 2027 ME

Personal GATE Mechanical prep app for Satyam Majumder. **Early foundation — not a finished learning platform.**

Repo: https://github.com/Xlaton25/gate-mechanical-prep (`main`, public by owner's choice; synced with Lovable). No PDFs, keys or credentials are committed.

## Status
- Done: responsive UI shell with honest empty states; source inventory (26 PDFs, 859 pages, none verified); local-only settings.
- Done (milestone 1): unapplied DB schema + RLS (`db/`), server-only scoring (`src/server/scoring`), Asia/Kolkata study-day logic (`src/lib/study-day.ts`).
- Not done: owned Supabase connection, question import/validation, submit endpoint, scheduler, analytics, mocks, deployment.

## Commands
- `bun install`, `bun run dev`
- `bunx vitest run` — unit tests (scoring, study day, server boundary, inventory, routing)
- `tsgo --noEmit` — typecheck
- SQL tests: see `docs/supabase.md` (43 pgTAP checks; need a local Supabase; not yet run)
- Netlify build verified locally by owner (Node 24/npm, commit 1d770f6); live deploy not verified

## Docs
`docs/roadmap.md`, `docs/architecture.md`, `docs/supabase.md`, `docs/intake.md`, `docs/integration-checklist.md`.
The preview runs without any env vars; see `.env.example` for future placeholders.
