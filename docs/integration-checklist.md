# Integration checklist

## GitHub — done
Synced: https://github.com/Xlaton25/gate-mechanical-prep (`main`). Visibility: **public**, chosen explicitly by the owner. Because it is public, never commit PDFs, keys, solutions, real questions or credentials (`.gitignore` blocks `*.pdf`, `*.zip`, `.env*` except `.env.example`).

## Owned Supabase — pending
Follow `docs/supabase.md`. Do not enable Lovable Cloud. Migrations are prepared but unapplied.

## Netlify — pending
1. Import the GitHub repo; `netlify.toml` sets `NITRO_PRESET=netlify`.
2. Add secrets as Netlify env vars (server-only). Never `VITE_*` for secrets.
3. Verify SSR routes work with no SPA redirect. Not deployed.

## Before any paid service
Stop and get explicit approval.
