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
- No PDFs or credentials in git (.gitignore enforces *.pdf, *.zip, .env).
- SQL migrations live in db/migrations (supabase/migrations is Lovable-managed); unapplied until owned Supabase is linked.
- Server-only code lives in src/server/ with *.server.ts names — double guard keeps it out of client bundles.
- Marking policies are per exam year; never score a paper without its own verified policy.
- Repo is public — commit only synthetic test fixtures, never real questions/keys.
- Docs live in docs/ (roadmap, architecture, intake, integration-checklist).
