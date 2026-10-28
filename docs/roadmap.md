# Roadmap — GATE 2027 ME

## Phase 0 — Foundation (this commit; partial)
- [x] Responsive app shell, navigation, light/dark theme, honest empty states
- [x] Typed domain model (source files / papers / questions / answer keys / attempts / revision)
- [x] Pure source-inventory fixture for ME.zip (26 PDFs, 859 pages) + searchable registry
- [x] Local-only study settings (minutes unset, Asia/Kolkata, reset time)
- [x] Netlify config prepared (not deployed)
- [x] Owned external Supabase project GATE connected (utlagjareqqrtztmlmgz)
- [x] GitHub sync: Xlaton25/gate-mechanical-prep (public, owner's choice)

## Milestone 1 — DB-ready schema & scoring foundation
- [x] Migrations + RLS applied to GATE as combined remote migration `20261028040618`; pgTAP script (`db/tests`) not executed on Supabase
- [x] Server-only scoring (MCQ/MSQ/NAT, gate-2027-v1 policy) with unit tests
- [x] Study-day calc + idempotent assignment uniqueness (no scheduler yet)

## Milestone 2 — Accounts & synced preferences
- [x] /auth email/password sign-in, sign-up, confirmation state, sign-out
- [x] Settings: guest = local-only; signed-in = user_preferences (own uid, insert-if-absent, column-only update)
- [x] Combined schema migration applied to GATE (see docs/supabase.md)
- [ ] Real login / email confirmation / persistence tested end-to-end (not done by automation)

## Milestone 3 — Secure pilot practice
- [x] gate-2026-v1 policy (code + DB), authenticated list/detail/submit, idempotent transactional saves (migration 20261028163911)
- [x] /practice pilot screen (sign-in required, empty state until content exists)
- [ ] Private import of the separately validated 10-question 2026 pilot (owner-supplied; not in git)
- [ ] Signed-in end-to-end submission tested against real content

## Phase 1 — Data pipeline
OCR for 9 image-only PDFs; review 2013 booklets, 2014–2016 sets, 2015 image bodies, 2017/2020 mixed content; deduplicate into Papers; extract Questions; validation workflow.

## Phase 2 — Keys & checking
Versioned answer keys with provenance; server-only answer checking; keys never shipped to the client.

## Phase 3 — Practice & revision
Reliable 10-question daily assignments; spaced revision; mistake log; formula cards; concepts.

## Phase 4 — Analytics
Deterministic analytics; mastery with evidence counts; explainable preparation priorities; chronological backtests (train on years < Y, test on Y).

## Phase 5 — Mocks
Timed GATE-format mocks from validated questions.

Notion is used for planning/research only, never as a data source.
