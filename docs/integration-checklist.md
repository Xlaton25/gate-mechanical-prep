# Integration checklist

## GitHub (private, under Xlaton25)
Cannot be done from chat. In the Lovable editor: **Project Settings → Git → Connect GitHub**, choose the Xlaton25 account/org, create the new repository, keep it **private**. Confirm `.gitignore` excludes PDFs and env files before first push.

## Owned Supabase
1. Create the Supabase project under your own account.
2. In Lovable: **Project Settings → General → External Supabase → Connect** (do not enable Lovable Cloud).
3. Add schema migrations mirroring `src/domain/types.ts`, with RLS. Keys/answers in server-only tables.

## Netlify
1. Import the GitHub repo in Netlify; `netlify.toml` sets `NITRO_PRESET=netlify`.
2. Add secrets as Netlify env vars (server-only). Never `VITE_*` for secrets.
3. Verify SSR routes work with no SPA redirect. Keep the site private until ready.

## Before any paid service
Stop and get explicit approval.
