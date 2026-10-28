# Owned Supabase — schema, security and status

**Project:** GATE (ref `utlagjareqqrtztmlmgz`), owned external Supabase linked to Lovable. Lovable Cloud is not enabled.

## Applied migration mapping
Canonical, reviewable SQL stays in `db/migrations/`. It was applied to GATE **once**, as a single combined Lovable migration (2026-10-28), contents unchanged and in order:

| Remote migration version | Contents |
|---|---|
| `20261027160935` | `select 1` (no-op; created the generated types file) |
| `20261028040618` | `db/migrations/20261027000001_core_schema.sql` + `000002_security.sql` + `000003_integrity_hardening.sql` |

**Do not** run `db/migrations/*` against GATE again (e.g. via `supabase db push`) — the schema already exists and the statements are not idempotent. Use `supabase/migrations/` (Lovable-managed) as the remote history; new changes are new migrations.

## Post-apply read-only verification (2026-10-28, metadata only)
- 11 public tables, 8 private tables; 0 public tables without RLS; 15 public policies.
- anon: 0 table and 0 column grants in public/private. `authenticated` has no USAGE on schema `private`.
- `user_preferences` (authenticated): SELECT yes; INSERT on user_id allowed; UPDATE on reset_time yes, on user_id **no**; DELETE no.
- authenticated cannot INSERT into attempts or questions; service_role can read private.answer_keys.
- Rows: 1 marking policy (`gate-2027-v1`), 0 preference rows. No learner or content rows seeded.

## Tests
- pgTAP file `db/tests/security_integrity.test.sql` (43 checks): **not yet executed on Supabase**. The owner reports all 43 assertions passed in ephemeral PGlite with a simulated auth adapter.
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

## App usage (milestone 2)
- Email/password auth via the browser Supabase client; email provider settings are managed in the Supabase dashboard (Authentication → Providers / URL Configuration). Add the preview and future Netlify URLs (with `/auth`) to Redirect URLs for confirmation links.
- Settings reads/writes `user_preferences` for the current uid only: insert when absent, column-only update when present.
