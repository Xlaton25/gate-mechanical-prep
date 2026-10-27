# External Supabase connection check — result: not visible to this project

## What I checked (read-only)
- Project env: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PROJECT_ID`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_DB_URL` are all unset (I checked whether each is set, not its value).
- Browser auth status: `no_supabase`.
- No generated integration files (`src/integrations/supabase/*`, `supabase/config.toml`) exist.
- Running a read-only `SELECT 1` failed with: `failed_precondition: this project has no Supabase (Lovable Cloud) backend for the requested environment`.
- The only Supabase tool available to me enables Lovable Cloud, so I did not use it.

## Result
- Connected project name/reference: none visible.
- Backend type: none attached (not Cloud, not external).
- SELECT 1, table names, migration history: not run. No connection is available to run them on.

## Likely blocker
The organization may be linked at workspace level without a project ever being chosen for this Lovable project. That would leave nothing attached. A project link is what gives the project its env vars and a database to query.

## Owner step
Project Settings → General → External Supabase → Connect, then select the specific owned project (not only the organization). Then ask again and I'll repeat this read-only check.

No files edited, no migrations applied, Cloud not enabled.
