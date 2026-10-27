# Owned Supabase — schema, security and status

**Status: NOT APPLIED.** No remote database exists or is connected. Lovable Cloud is not enabled.
Migrations live in `db/migrations/` (Lovable reserves `supabase/migrations/` for its own tool).

| File | Contents |
|---|---|
| `20261027000001_core_schema.sql` | Tables, FKs, uniques, checks, NAT range exclusion |
| `20261027000002_security.sql` | RLS, least-privilege grants, verified 2027 marking policy row (rules only) |
| `db/tests/security_integrity.test.sql` | pgTAP checks (21) — not yet executed |

## Setup (once the owned project exists)
1. Create the Supabase project under your own account.
2. Locally: `supabase init` (if needed), `supabase link --project-ref <ref>`, copy `db/migrations/*` into `supabase/migrations/`, copy `db/tests/*` into `supabase/tests/`.
3. `supabase start && supabase db reset && supabase test db` — must pass locally first.
4. Only then `supabase db push` to the owned project.
5. Lovable: Project Settings → General → External Supabase → Connect.
6. Netlify env vars per `.env.example` (service role key server-only).

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

## Future extensions (not built)
Mastery/evidence tables, mock tests, formula cards, concept graph, "marks to all"/dropped-question key flags, admin roles table (`user_roles` + `has_role`), private storage bucket for PDFs.
