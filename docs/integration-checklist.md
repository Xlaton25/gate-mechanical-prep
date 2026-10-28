# Integration checklist

## GitHub — done
Synced: https://github.com/Xlaton25/gate-mechanical-prep (`main`). Visibility: **public**, chosen explicitly by the owner. Because it is public, never commit PDFs, keys, solutions, real questions or credentials (`.gitignore` blocks `*.pdf`, `*.zip`, `.env.*`; `.env` is tracked with public values only — URL + publishable key — because hosted builds need it).

## Owned Supabase — connected
GATE (`utlagjareqqrtztmlmgz`) linked; combined schema migration applied 2026-10-28 (`docs/supabase.md`). Owner: add preview/Netlify URLs to Supabase Auth Redirect URLs; confirm email provider settings.

## Netlify — pending
1. Import the GitHub repo; `netlify.toml` sets `NITRO_PRESET=netlify`.
2. Add secrets as Netlify env vars (server-only). Never `VITE_*` for secrets.
3. Verify SSR routes work with no SPA redirect. Not deployed.

Build status: `NITRO_PRESET=netlify npm run build` independently run locally by Codex (Node 24/npm, commit 1d770f6) and succeeded. Live Netlify deploy not verified.

## Before any paid service
Stop and get explicit approval.
