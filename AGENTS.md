<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project rules
- Backend is an owned external Supabase; never enable Lovable Cloud — user requires backend ownership.
- Deploy target is Netlify via Nitro `netlify` preset (netlify.toml); no SPA fallback — app is SSR.
- Domain types in src/domain, pure fixtures in src/data, shared UI in src/components/app — keeps data separate from UI.
- Never fabricate questions, answers, metrics or chart points; show empty states — data is unverified.
- Answer checking and keys are server-only — keys must never reach the client.
- Source statuses exclude "verified" until validation tooling exists.
- No PDFs or credentials in git (.gitignore enforces *.pdf, *.zip, .env.*). `.env` IS tracked and may hold only public browser config (URL, publishable key) — hosted builds need it; a test rejects secrets in it.
- Canonical SQL lives in db/migrations; the owned GATE project received 000001–000003 as ONE combined applied migration `20261028040618` (mapping in docs/supabase.md); later files each get their own migration (full list in docs/supabase.md); a parity test compares them — never re-run db/migrations against the remote.
- Practice question detail comes only from `practice_question_view` (one statement returns DTO + revision) — a separate read and revision call could pair old wording with a new revision.
- Auth state comes only from AuthProvider in src/lib/auth.tsx (single listener) — avoids competing subscribers and stale sessions.
- Account preferences go through the PreferencesStore port with the user session (RLS), never the admin client; updates send only preference columns.
- Server-only code lives in src/server/ with *.server.ts names — double guard keeps it out of client bundles.
- Marking policies are per exam year; never score a paper without its own verified policy.
- Repo is public — commit only synthetic test fixtures, never real questions/keys.
- Docs live in docs/ (roadmap, architecture, intake, integration-checklist).
- Scoring/saving goes through service-role-only invoker RPCs (`practice_*`) called from `src/server/practice/*.server.ts`; learners never get EXECUTE on them — keys/solutions stay in `private`.
- Server functions get the bearer via `attachSupabaseAuth` in src/start.ts and verify it with `requireSupabaseAuth`; user ID always comes from the token, never the body.
- Every practice call sends `expectedUserId`; the server rejects it when it differs from the verified token (never derives identity from it) — the attacher reads the session asynchronously, so a switch mid-call could otherwise act as the new account.
- Practice saves: replay lookup before content checks; SHARE-lock all scoring-content tables inside the record RPC; solutions are immutable and snapshotted per attempt — keeps retries and shown solutions consistent with the saved score.
- Client retries resend the exact frozen SubmitInput (incl. duration) until a definite outcome — the request hash covers every field.
- Question/option/solution text renders only through MathMarkdown (no raw HTML, untrusted KaTeX).
- Daily sets, revision scheduling and mini-tests are written only by service-role invoker RPCs/tables in `src/server/learning/*.server.ts`; learners read own rows via RLS — keeps selection and spaced-repetition state unforgeable.
- Mini-test finalization resends each item's stored submission_id + bound revision through `submitAttempt` — retries replay, never duplicate attempts or revision steps.
