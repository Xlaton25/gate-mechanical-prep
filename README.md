# GATE Mechanical Prep

Create a private/unpublished project named "GATE 2027 ME" for Satyam Majumder. Phase 0 roadmap and design are APPROVED. This task is ONLY the initial frontend foundation, source inventory and documentation; do not claim the complete learning platform is finished.
Architecture: Lovable + new private GitHub repository + Netlify + an OWNED external Supabase backend. DO NOT enable Lovable Cloud or provision any database, AI runtime, paid service, public deployment or authentication yet. Backend ownership/connection must be resolved first. Do not call external tools or connectors to send messages. Do not publish. If automatic backend default cannot be avoided, stop and report it before provisioning.
Use maintainable React/TypeScript/Tailwind/shadcn and the supported framework. Prepare Netlify compatibility for the actual framework: Vite SPA needs index.html fallback; TanStack Start needs its Netlify adapter and NO SPA fallback. Do not deploy. Never put secrets in source/client vars.
Build premium minimal mobile-first responsive study UI: warm white #F8FAFC, slate #0F172A, indigo #4F46E5; light/dark themes; readable sans serif and math; subtle borders, 12-16px radii, 44px targets, keyboard focus. Desktop sidebar groups Study (Dashboard, Daily Practice, Learning Hub, Revision), Explore (PYQ Explorer, Trends), Assess (Mock Tests, Analytics), Manage (Settings, Data Administration). Mobile bottom navigation Home, Practice, Revise, Tests, More.
Implement real navigation and honest empty states throughout. Dashboard primary daily practice card, due revisions, checklist, study availability and coverage. No fake progress, streaks, forecasts or metrics. All learning data currently unverified/unimported: state this clearly and disable scored practice with explanation. Trends window selectors all/10/5/3 years and empty evidence state, not fabricated chart points. Revision queue/mistake/formula tabs show meaningful empty states. Practice input component can exist but DO NOT seed fabricated PYQs or answers. Settings allow local-only study minutes (unset initially), Asia/Kolkata default timezone and reset time; disclose local-only persistence, not cross-device login. Data admin source registry is usable/searchable, with file name/year/page count and status; no PDF download routes or private docs.
Confirmed intake from user-uploaded ME.zip: ZIP integrity passed; 26 PDFs; 859 PDF pages; filenames 2007-2026; no byte-identical PDF duplicates. This is not complete session/question coverage. No questions have been verified yet. Files/pages:
ME2007.pdf 19; ME2008.pdf 21; ME2009.pdf 12; ME2010.pdf 16; ME2011.pdf 14; ME2012.pdf 15; ME2013.pdf 56; ME2014.pdf 75; ME2015.pdf 70; ME2016.pdf 52; ME2017_1.pdf 19; ME2017_2.pdf 21; ME2018_1.pdf 20; ME2018_2.pdf 21; ME2019_1.pdf 25; ME2019_2.pdf 25; ME2020_1.pdf 19; ME2020_2.pdf 20; ME2021_1.pdf 35; ME2021_2.pdf 33; ME2022_1.pdf 46; ME2022_2.pdf 49; ME2023.pdf 56; ME2024.pdf 35; ME2025.pdf 41; ME2026.pdf 44.
Sampled pages have no text layer for 2007-2011, both 2019 and both 2021 PDFs (9 PDFs). 2015 question bodies/answer colouring are image-based despite selectable metadata; 2017 and 2020 mixed content require inspection. 2013 combines A-D booklet codes labelled sessions; do not count as 4 distinct exams before deduplication. 2014-2016 contain multiple sets. Some files embed keys; their official provenance remains unverified. Use statuses received, sampled, needs OCR, needs review; never verified.
Create typed domain interfaces separating source files/papers/questions/answer keys/attempts/revision, pure inventory fixture, and documentation docs/roadmap.md, docs/architecture.md, docs/intake.md, docs/integration-checklist.md. Target full roadmap later: reliable 10-question daily assignments, server-only answer checking, validated PYQs, versioned keys, deterministic analytics and explainable preparation priorities, chronological backtests, mastery with evidence counts, spaced revision, concepts, and mocks. Notion is planning/research only.
Run build/typecheck and inspect responsive layout. Report actual tests, limitations and commit SHA. Check whether you can establish Git sync to a NEW PRIVATE repository under Xlaton25 without user UI interaction, but do not claim sync exists unless verified. If unavailable, report the exact project editor step. Preserve no PDFs or credentials in git. Use existing credits only; stop before any paid upgrade or spend approval.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/b0675764-3f57-4a72-a58e-b79674bbc2f2).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
