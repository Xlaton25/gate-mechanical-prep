# Owned Supabase — schema, security and status

**Project:** GATE (ref `utlagjareqqrtztmlmgz`), owned external Supabase linked to Lovable. Lovable Cloud is not enabled.

## Applied migration mapping
Canonical, reviewable SQL stays in `db/migrations/`. It was applied to GATE **once**, as a single combined Lovable migration (2026-10-28), contents unchanged and in order:

| Remote migration version | Contents |
|---|---|
| `20261027160935` | `select 1` (no-op; created the generated types file) |
| `20261028040618` | `db/migrations/20261027000001_core_schema.sql` + `000002_security.sql` + `000003_integrity_hardening.sql` |
| `20261028163911` | `db/migrations/20261028000004_practice_submission.sql` (own migration, unchanged) |

**Do not** run `db/migrations/*` against GATE again (e.g. via `supabase db push`) — the schema already exists and the statements are not idempotent. Use `supabase/migrations/` (Lovable-managed) as the remote history; new changes are new migrations.

## Post-apply read-only verification (2026-10-28, metadata only)
- 11 public tables, 8 private tables; 0 public tables without RLS; 15 public policies.
- anon: 0 table and 0 column grants in public/private. `authenticated` has no USAGE on schema `private`.
- `user_preferences` (authenticated): SELECT yes; INSERT on user_id allowed; UPDATE on reset_time yes, on user_id **no**; DELETE no.
- authenticated cannot INSERT into attempts or questions; service_role can read private.answer_keys.
- Rows: 1 marking policy (`gate-2027-v1`), 0 preference rows. No learner or content rows seeded.

## Tests
- pgTAP file `db/tests/security_integrity.test.sql` (43 checks): **not yet executed on Supabase**. Codex independently ran it: all 43 assertions passed in ephemeral PGlite with a simulated auth adapter.
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
- Marking policies are per exam year; only `gate-2027-v1` exists. Historical papers stay unscorable until their own policy is verified.
- Daily assignments idempotent (`unique(user_id, study_day)`, items unique per position/question). **No scheduler yet.**

## Milestone 3 — secure practice submission (000004)
- Adds verified `gate-2026-v1` (MCQ −1/3, −2/3; MSQ/NAT no penalty/partial; source gate2026.iitg.ac.in, rechecked 2026-10-28). Year match still enforced.
- `attempts` gains `submission_id` (unique per user), `request_hash` (same ID + altered payload → conflict), `context_fingerprint` (md5 of question/options/latest key/policy at scoring time).
- RPCs `practice_scoring_context`, `practice_record_attempt`, `practice_solution` (+ `private.practice_context`): SECURITY INVOKER, `search_path=''`, EXECUTE revoked from PUBLIC/anon/authenticated, granted to service_role only. Latest key version only — a newer unverified key blocks scoring (no fallback). Record re-derives the context under a share lock and returns `stale` if anything changed.
- Live read-only check after apply: all 4 functions invoker, empty search_path, anon/authenticated execute = false, service_role = true; policies 2026 + 2027 verified; 0 attempt rows.
- Rehearsal: `db/tests/practice_submission.rehearsal.mjs` (26 checks, PGlite with simulated roles, synthetic ephemeral fixture) passed in the Lovable sandbox. Not covered: true concurrent inserts (PGlite is single-connection; the unique constraint + `on conflict do nothing` path is reasoned, not raced). Known limit: a key inserted concurrently with a save is not locked out by the question share lock; the fingerprint check catches any change committed before the save.

## App usage (milestone 2)
- Email/password auth via the browser Supabase client; email provider settings are managed in the Supabase dashboard (Authentication → Providers / URL Configuration). Add the preview and future Netlify URLs (with `/auth`) to Redirect URLs for confirmation links.
- Settings reads/writes `user_preferences` for the current uid only: insert when absent, column-only update when present.
