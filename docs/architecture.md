# Architecture

- **Frontend:** TanStack Start v1 (React 19, SSR), TypeScript, Tailwind v4, shadcn/ui. Edited in Lovable.
- **Source control:** https://github.com/Xlaton25/gate-mechanical-prep (`main`, public by owner choice), Lovable Git sync active.
- **Hosting:** Netlify via Nitro `netlify` preset (`netlify.toml`). SSR app, so no SPA `index.html` fallback. Not deployed.
- **Backend:** owned external Supabase project GATE (`utlagjareqqrtztmlmgz`): schema applied, email/password auth used by `/auth`. Lovable Cloud intentionally NOT enabled.

## Layers
| Path | Purpose |
|---|---|
| `src/domain/types.ts` | Domain interfaces; separate SourceFile, Paper, Question, AnswerKeyVersion, Attempt, RevisionItem |
| `src/data/source-inventory.ts` | Pure metadata fixture of the intake; no PDFs, no content |
| `src/lib/local-settings.ts` | Browser-only settings & theme |
| `src/components/app/*` | Shell, nav config, shared UI, answer input |
| `src/routes/*` | One file per page |
| `src/server/**/*.server.ts` | Server-only pure logic (scoring, policies); blocked from client bundles |
| `src/lib/study-day.ts` | Deterministic study-day (tz + HH:mm reset) |
| `db/migrations`, `db/tests` | Canonical SQL (applied once as a combined migration) and pgTAP tests |
| `src/lib/auth.tsx` | AuthProvider (single auth listener), sign-in/up port |
| `src/lib/preferences*.ts`, `use-account-preferences.ts` | Validated preference DTOs, store port, race-safe hook |

## Invariants
- Answer keys and correctness checking live server-side only.
- Statuses are `received | sampled | needs_ocr | needs_review`; no `verified` until validation tooling exists.
- No fabricated questions, answers, progress, streaks or chart points.
- No PDFs, credentials or private documents in git or served routes.
- Secrets only in server env (Netlify/Supabase), never `VITE_*`.
