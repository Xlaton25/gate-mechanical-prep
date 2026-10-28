# Roadmap

- [x] Confirm owned Supabase GATE (utlagjareqqrtztmlmgz) link, read-only
- [x] Email/password auth UI + account-synced study preferences (code + tests)
- [x] Apply combined db/migrations 000001–000003 to GATE (one migration, 20261028040618)
- [x] Real sign-in / email confirmation (owner-reported "yes done"; not independently tested)
- [x] Secure pilot practice submission + migration 000004 (20261028163911)
- [x] Review corrections: frozen retries, account binding, content locks, replay-first + solution snapshot, safe math rendering, migration 000005 (20261028165705)
- [x] Fix stale attempt fixtures in 43-check pgTAP suite (43/43 on PG17 + pgTAP)
- [ ] View-revision binding before admin content edits (detail DTO revision + submit check)
- [x] Import the validated 2026 pilot privately (owner approved transfer; file now attached)
- [ ] Import mechanism: create-only transactional service-only RPC, idempotent, aborts on mismatch
- [ ] Import pilot content: sources, import-job audit, paper session6, syllabus paths, 10 questions + options, keys/NAT ranges, reviewed solutions
- [ ] Practice page: load real 10, safe Markdown/KaTeX/table render, topic + source year/session/question/page, partial-pilot label
- [ ] Replace blanket "no questions exist" copy on dashboard /pyq /admin DataNotice with DB-derived facts
- [ ] Live read-only verification of import + privilege boundaries; SQL/typecheck/build checks
