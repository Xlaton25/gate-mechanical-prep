# Integration checklist

## GitHub — done
Synced: https://github.com/Xlaton25/gate-mechanical-prep (`main`). Visibility: **public**, chosen explicitly by the owner. Because it is public, never commit PDFs, keys, solutions, real questions or credentials (`.gitignore` blocks `*.pdf`, `*.zip`, `.env*` except `.env.example`).

## Owned Supabase — pending
Owner action: Project Settings → General → External Supabase → Connect. Do not enable Lovable Cloud. Migrations are prepared but unapplied; maintainer steps in `docs/supabase.md`.

## Netlify — pending
1. Import the GitHub repo; `netlify.toml` sets `NITRO_PRESET=netlify`.
2. Add secrets as Netlify env vars (server-only). Never `VITE_*` for secrets.
3. Verify SSR routes work with no SPA redirect. Not deployed.

Build status: `NITRO_PRESET=netlify npm run build` verified locally by the owner (Node 24/npm, commit 1d770f6). Live Netlify deploy not verified.

## Before any paid service
Stop and get explicit approval.
