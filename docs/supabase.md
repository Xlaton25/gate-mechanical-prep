# Owned Supabase — schema, security and status

**Status: NOT APPLIED.** No external Supabase is connected; existence of an owned project is unverified. Lovable Cloud is not enabled.
Migrations live in `db/migrations/` (Lovable reserves `supabase/migrations/` for its own tool).

| File | Contents |
|---|---|
| `20261027000001_core_schema.sql` | Tables, FKs, uniques, checks, NAT range exclusion |
| `20261027000002_security.sql` | RLS, least-privilege grants, verified 2027 marking policy row (rules only) |
| `20261027000003_integrity_hardening.sql` | Attempt key/policy/assignment consistency, NAT-only finite ranges, same-question supersedes, deferred MCQ/MSQ option validation, HH:mm reset times |
| `db/tests/security_integrity.test.sql` | pgTAP checks (43) — not yet executed |

## Owner action (only step needed)
In Lovable: **Project Settings → General → External Supabase → Connect**, and choose your owned project. Migration and test work is handled by the maintainer after that.

## Maintainer local verification (before any remote apply)
Requires Supabase CLI + Docker, Postgres 15+.
1. `supabase init` (if needed); copy `db/migrations/*` → `supabase/migrations/`, `db/tests/*` → `supabase/tests/`.
2. `supabase start && supabase db reset && supabase test db` — all 43 pgTAP checks must pass.
3. Only after that, apply to the connected owned project.

## Security boundaries
- `public` (Data API): RLS on every table; tables first revoked from `public/anon/authenticated`, then granted minimally. **anon: no grants.**
- Learners (`authenticated`): read own profile/preferences/assignments/items/attempts/revision; insert/update only preference/profile columns (owner column not updatable). Read only `published` papers and `validated` questions/options, verified policies, topics.
- Learners cannot write attempts, scores, assignments, revision or content — only the server (`service_role`).
- `private` schema (source files, storage paths, import jobs, paper↔booklet mappings, provenance, validation audit, answer keys, NAT ranges, solutions): no usage for anon/authenticated; not to be added to exposed schemas.
- No security-definer functions. The single trigger function is invoker-rights, `search_path=''`, execute revoked from public.

## Integrity rules
- NAT keys: `answer_key_nat_ranges` rows, inclusive `[min,max]`, gist exclusion forbids overlap/touching, so gaps are never collapsed.
- Key versions: `unique(question_id, version)`; attempts store `key_version_id` and `marking_policy_id`.
- Marking policies are per exam year; `papers(marking_policy_id, exam_year)` FK prevents applying 2027 rules to other years. Only `gate-2027-v1` exists (source: gate2027.iitm.ac.in/question_paper_pattern, checked 2026-10-27: MCQ −1/3 / −2/3; MSQ/NAT no negative, no partial). Historical papers stay unscorable until their own policy is verified.
- Daily assignments: `unique(user_id, study_day)`, items `unique(assignment_id, position)` + `unique(assignment_id, question_id)` → retries idempotent with `on conflict do nothing`. **No scheduler exists yet.**

## Verification record
- Unit tests (32) and `tsc --noEmit`: passed in Lovable and independently on a clean clone.
- `NITRO_PRESET=netlify npm run build`: verified locally by the owner (Node 24/npm) on commit 1d770f6, emitting `.netlify/functions-internal/server/main.mjs` and `nitro.json`; scoring code and synthetic fixtures absent from `dist/assets`.
- **Not verified:** live Netlify deployment; pgTAP SQL tests (never executed); migrations never applied anywhere.

## Future extensions (not built)
Re-validating MCQ/MSQ keys when options are deleted later (today checked on key insert/update only), mastery/evidence tables, mock tests, formula cards, concept graph, "marks to all"/dropped-question key flags, admin roles table (`user_roles` + `has_role`), private storage bucket for PDFs.
