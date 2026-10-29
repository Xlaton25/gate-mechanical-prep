# Owned Supabase — schema, security and status

**Project:** GATE (ref `utlagjareqqrtztmlmgz`), owned external Supabase linked to Lovable. Lovable Cloud is not enabled.

## Applied migration mapping
Canonical, reviewable SQL stays in `db/migrations/`. It was applied to GATE **once**, as a single combined Lovable migration (2026-10-28), contents unchanged and in order:

| Remote migration version | Contents |
|---|---|
| `20261027160935` | `select 1` (no-op; created the generated types file) |
| `20261028040618` | `db/migrations/20261027000001_core_schema.sql` + `000002_security.sql` + `000003_integrity_hardening.sql` |
| `20261028163911` | `db/migrations/20261028000004_practice_submission.sql` (own migration, unchanged) |
| `20261028165705` | `db/migrations/20261028000005_practice_hardening.sql` (own migration, unchanged) |

**Do not** run `db/migrations/*` against GATE again (e.g. via `supabase db push`) — the schema already exists and the statements are not idempotent. Use `supabase/migrations/` (Lovable-managed) as the remote history; new changes are new migrations.

## Post-apply read-only verification (2026-10-28, metadata only)
- 11 public tables, 8 private tables; 0 public tables without RLS; 15 public policies.
- anon: 0 table and 0 column grants in public/private. `authenticated` has no USAGE on schema `private`.
- `user_preferences` (authenticated): SELECT yes; INSERT on user_id allowed; UPDATE on reset_time yes, on user_id **no**; DELETE no.
- authenticated cannot INSERT into attempts or questions; service_role can read private.answer_keys.
- Rows at first apply: 1 marking policy (`gate-2027-v1`), 0 preference rows; 000004 later added `gate-2026-v1`. No learner or content rows seeded.

## Tests
- pgTAP file `db/tests/security_integrity.test.sql` (43 checks): **not yet executed on Supabase**. Earlier, Codex independently ran it against 000001–000003 in PGlite (43/43). After 000004 added NOT NULL `submission_id`/`request_hash`/`context_fingerprint`, its synthetic attempt fixtures hit 23502 before the intended checks (Codex reported 6 failures on 000001–000005); the six fixtures now supply unique submission UUIDs and placeholder hashes, with no assertion changed or removed. Re-run 2026-10-28 with **real pgTAP 1.3.3 on real PostgreSQL 17** after 000001–000005 via `db/tests/security_integrity.pg.sh`: **43/43 passed**. Harness notes: pgTAP was loaded from its generated SQL (no extension package), so the runner drops only the `create extension pgtap` line; `auth.users`/`auth.uid()` are stubs that read `request.jwt.claims` like Supabase.
- Maintainer local run (Supabase CLI + Docker): copy `db/migrations/*` → a scratch `supabase/migrations/`, `db/tests/*` → `supabase/tests/`, then `supabase start && supabase db reset && supabase test db`. Local only — never push that copy.

## Security boundaries
- `public` (Data API): RLS on every table; revoked from `public/anon/authenticated`, then granted minimally. **anon: no grants.**
- Learners read own profile/preferences/assignments/items/attempts/revision; insert/update only preference/profile columns (owner column not updatable). Read only `published` papers, `validated` questions/options, verified policies, topics.
- Learners cannot write attempts, scores, assignments, revision or content — only `service_role`.
- `private` schema (sources, storage paths, imports, mappings, provenance, validation audit, answer keys, NAT ranges, solutions): never exposed.
- No security-definer functions; trigger functions are invoker-rights with `search_path=''`.

## Integrity rules
- NAT keys: inclusive disjoint `[min,max]` ranges (gist exclusion), finite only, NAT keys only.
- Key versions unique per question; attempts store `key_version_id` (same question) and `marking_policy_id` (must equal the paper's policy).
- Marking policies are per exam year; verified policies are `gate-2026-v1` and `gate-2027-v1` (each its own year only). Other historical papers stay unscorable until their own policy is verified.
- Daily assignments idempotent (`unique(user_id, study_day)`, items unique per position/question). **No scheduler yet.**

## Milestone 3 — secure practice submission (000004)
- Adds verified `gate-2026-v1` (MCQ −1/3, −2/3; MSQ/NAT no penalty/partial; source gate2026.iitg.ac.in, rechecked 2026-10-28). Year match still enforced.
- `attempts` gains `submission_id` (unique per user), `request_hash` (same ID + altered payload → conflict), `context_fingerprint` (md5 of question/options/latest key/policy at scoring time).
- RPCs `practice_scoring_context`, `practice_record_attempt`, `practice_solution` (+ `private.practice_context`): SECURITY INVOKER, `search_path=''`, EXECUTE revoked from PUBLIC/anon/authenticated, granted to service_role only. Latest key version only — a newer unverified key blocks scoring (no fallback). Record re-derives the context under a share lock and returns `stale` if anything changed.
- Live read-only check after apply: all 4 functions invoker, empty search_path, anon/authenticated execute = false, service_role = true; policies 2026 + 2027 verified; 0 attempt rows.
- Rehearsal: `db/tests/practice_submission.rehearsal.mjs` (26 checks, PGlite with simulated roles, synthetic ephemeral fixture) passed in the Lovable sandbox. Not covered: true concurrent inserts (PGlite is single-connection; the unique constraint + `on conflict do nothing` path is reasoned, not raced). (This limit is closed by 000005.)

## Milestone 3b — practice hardening (000005)
- Replay first: `practice_lookup_submission(user, submission, hash)` runs before any current content is required; same hash → original attempt, altered hash → conflict, even if the question was retired or the key unverified since.
- Scoring-content race closed: `practice_record_attempt` takes `SHARE` locks (fixed order) on `marking_policies, papers, questions, question_options, private.answer_keys, private.answer_key_nat_ranges, private.solutions`, then re-derives the context. Writers (`ROW EXCLUSIVE`) wait for in-flight saves and vice versa; saves never block each other. `lock_timeout` 5s → sanitized `server_error` (client retries the same frozen submission). Content imports should run outside peak practice and lock tables in the same order to avoid deadlocks.
- Solution snapshot: `private.solutions` gains `answer_key_id` (same-question FK) and `reviewed`; rows are immutable (trigger; only reviewed false→true). `attempts.solution_id` stores the reviewed solution for the exact key version scored (composite FK), or null. Replay returns that snapshot. `practice_solution` (newest arbitrary) was dropped.
- Verified: `db/tests/practice_hardening.pg.sh` — real PostgreSQL 17, separate concurrent sessions, synthetic throwaway cluster: 26/26 passed (writer blocked by in-flight save; save during uncommitted newer key → stale; 3 simultaneous identical retries → 1 row; different saves not serialised; replay after retirement; immutability; privileges). Live read-only check after apply: all practice functions invoker, `search_path=""`, anon/authenticated execute = false; 0 attempts/solutions/questions. Live signed-in submission still unrun (no content).

## Known limitation — content edits vs what the learner saw
- The fingerprint/stale check protects the load→score→save race: a save never uses a key/options/policy that changed after scoring.
- It does **not** bind the question body/option *wording the learner viewed*: the detail response carries no revision, so if wording or options were edited between viewing and submitting, the answer would be scored against the current content, not the displayed one.
- No content editing or import is enabled today, so no learner is affected. Before enabling admin edits or imports that change live questions, add a view revision (e.g. content hash in the detail DTO, echoed on submit and checked in `practice_record_attempt`) so changed wording/options return `stale` instead of grading an old display.
- The private pilot (`ME2026-normalized.json`) is **not imported**; its transfer is pending the owner's explicit approval.
- Parity: `src/test/migration-parity.test.ts` asserts each applied file equals its canonical source (comments/whitespace ignored).

## App usage (milestone 2)
- Email/password auth via the browser Supabase client; email provider settings are managed in the Supabase dashboard (Authentication → Providers / URL Configuration). Add the preview and future Netlify URLs (with `/auth`) to Redirect URLs for confirmation links.
- Settings reads/writes `user_preferences` for the current uid only: insert when absent, column-only update when present.

## Status after the ME2026 pilot import (2026-10-28)

Applied migration mapping (canonical `db/migrations` -> applied in owned GATE `utlagjareqqrtztmlmgz`):
- 000001-000003 -> `20261028040618` (one combined batch)
- 000004 -> `20261028163911`
- 000005 -> `20261028165705`
- 000006 -> `20261028173202` (content-bound view revision + service-only create-only pilot import)
- 000007 -> `20261028173740` (display provenance: page + paper file name only)
- 000008 -> `20261028224036` (single-snapshot `practice_question_view`: question DTO + revision from one statement, allowlisted fields, service-role only; importer compares whole existing option sets before any write and rejects missing required fields). Detail reads no longer pair a separate RLS read with a second revision call.
- 000009 -> `20261028225758` (learning MVP: `ensure_daily_assignment` one set per user/study day with recorded reasons; `practice_eligible_questions`; spaced revision 1/3/7/14/30 via an AFTER INSERT trigger on attempts so replays never advance twice; `mark_for_revision`; own-user `bookmarks`, `daily_checklist`; server-written `mini_tests`/`mini_test_items`; pg_cron job `gate-daily-sets` daily 22:35 UTC (04:05 IST) calling `private.generate_due_daily()` for users with saved preferences, with on-request catch-up). Rehearsal: `db/tests/learning_mvp.pg.sh` (27 synthetic checks).

Imported: 1 paper (ME2026, session 6) with verified policy `gate-2026-v1`, 10 validated questions
(numbers 1, 2, 4, 5, 6, 7, 11, 16, 18, 61; 9 MCQ + 1 NAT, 13 marks), their options, official version-1
answer keys and one NAT range, 10 reviewed authored solutions bound to those keys, provenance/source
manifest, one import-job audit row and 22 syllabus topic links. This is PARTIAL pilot coverage only:
the 44-page PDF and the 65-question paper are not fully processed.

Verified: local PostgreSQL rehearsal 83/83 (create-only import, exact rerun no-op, conflict abort,
content-bound revision, stale-save, replay-after-change, privileges); pgTAP security suite 43/43 against
000001-000006; concurrency rehearsal 26/26; live read-only checks (10 questions validated, attempts = 0,
no learner or fake user rows, new functions executable by service_role only); offline scoring of the real
imported contexts with no writes.

Unverified / remaining: a real signed-in submission through the app UI; exact repeat-run no-op of the live
import call; daily-10 scheduling; content editing/admin edits (view-revision checks exist for the learner
path only); Netlify deployment of the current build; Supabase leaked-password protection is disabled
(pre-existing warning).


### Source figures (2026-10-29)
Canonical `20261029000010_question_source_figures.sql` matches applied `20261029042653_question_source_figures.sql`. Source images remain in `private.question_figures`; only the authenticated server's single-snapshot question view returns allowlisted PNG artwork. SHA-256 and PNG signatures are checked at insertion. Images cannot change while a question is validated, and their hashes are bound into the scoring revision.

Direct corpus import: 390 questions across six 2022–2026 papers, of which 380 have passed source/key review and 10 require scorer support. All 65 questions from 2026 passed source/key review. Only the original 10 are currently eligible in the deployed app: the 370 new reviewed questions are temporarily held until a build containing the source-image renderer and historical marking policies is available. GitHub API/CLI writes were blocked; the owner completed browser sign-in and the prepared code is being synced through GitHub directly. Ten official-key exceptions need scorer support. The user-approved 31 source-image corrections were applied and their stored hashes verified; one corrected question remains a special-key exception. The original ten question records and four saved attempts were preserved. New worked explanations and detailed topic classification remain pending. Twenty older PDFs remain at extraction/reconciliation stage; do not describe the full 2007–2026 corpus as complete. Source manifests cover all 26 uploaded PDFs.
