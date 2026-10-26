# Roadmap — GATE 2027 ME

## Phase 0 — Foundation (this commit; partial)
- [x] Responsive app shell, navigation, light/dark theme, honest empty states
- [x] Typed domain model (source files / papers / questions / answer keys / attempts / revision)
- [x] Pure source-inventory fixture for ME.zip (26 PDFs, 859 pages) + searchable registry
- [x] Local-only study settings (minutes unset, Asia/Kolkata, reset time)
- [x] Netlify config prepared (not deployed)
- [ ] Owned external Supabase project connected (blocked: ownership decision)
- [ ] Private GitHub repo under Xlaton25 (blocked: user connects in editor)

## Phase 1 — Data pipeline
OCR for 9 image-only PDFs; review 2013 booklets, 2014–2016 sets, 2015 image bodies, 2017/2020 mixed content; deduplicate into Papers; extract Questions; validation workflow.

## Phase 2 — Keys & checking
Versioned answer keys with provenance; server-only answer checking; keys never shipped to the client.

## Phase 3 — Practice & revision
Reliable 10-question daily assignments; spaced revision; mistake log; formula cards; concepts.

## Phase 4 — Analytics
Deterministic analytics; mastery with evidence counts; explainable preparation priorities; chronological backtests (train on years < Y, test on Y).

## Phase 5 — Mocks
Timed GATE-format mocks from validated questions.

Notion is used for planning/research only, never as a data source.
