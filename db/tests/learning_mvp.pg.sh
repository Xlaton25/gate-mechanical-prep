#!/usr/bin/env bash
# Real PostgreSQL rehearsal of migration 000009 (daily sets, spaced revision, bookmarks, mini-tests).
# Throwaway local cluster, simulated Supabase roles, SYNTHETIC rows only. Never touches a remote.
# Usage: bash db/tests/learning_mvp.pg.sh
set -euo pipefail
if [ "$(id -u)" = 0 ]; then exec setpriv --reuid=65534 --regid=65534 --clear-groups env HOME=/tmp PATH="$PATH" bash "$(readlink -f "$0")"; fi
DIR=$(mktemp -d /tmp/pglm.XXXX)
M="$(cd "$(dirname "$0")/../migrations" && pwd)"
PORT=${PGPORT_REHEARSAL:-55442}
initdb -D "$DIR/data" -U postgres -A trust >/dev/null
pg_ctl -D "$DIR/data" -o "-k $DIR -p $PORT -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
trap 'pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1; rm -rf "$DIR"' EXIT
q() { psql -X -qAt -v ON_ERROR_STOP=1 -h "$DIR" -p "$PORT" -U postgres -d postgres "$@"; }
PASS=0; FAIL=0
ok() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "ok - $1"; else FAIL=$((FAIL+1)); echo "NOT OK - $1 (got '$2', want '$3')"; fi; }

q -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;" >/dev/null
for f in $(ls "$M" | sort); do q -f "$M/$f" >/dev/null; done

U1=00000000-0000-4000-8000-0000000000a1; U2=00000000-0000-4000-8000-0000000000a2
q -c "insert into auth.users values ('$U1'), ('$U2');" >/dev/null
python3 - > "$DIR/p.json" <<'PY'
import json
def mcq(n, k): return {"number": n, "source_page": 2, "type": "MCQ", "marks": 1, "topic_path": ["Synthetic Subject", f"Area {n%2}"],
  "body_md": f"Synthetic body {n}", "options": [{"option_id": "A", "body_md": "a"}, {"option_id": "B", "body_md": "b"}],
  "key": {"provenance": "official", "provenance_verified": True, "mcq_option": k}, "solution": {"provenance": "authored", "body_md": f"Synthetic solution {n}"}}
print(json.dumps({"format_version": 1, "exam_year": 2026, "session_label": "synthetic", "marking_policy_id": "gate-2026-v1",
  "validation_date": "2026-10-28", "source": {"file_name": "SYNTHETIC.pdf", "page_count": 4, "sha256": "a"*64,
  "paper_url": "https://example.invalid/p", "key_url": "https://example.invalid/k", "identity": "synthetic"},
  "questions": [mcq(1, "A"), mcq(2, "B"), mcq(3, "A")]}))
PY
q -c 'select public.pilot_import($pl$'"$(cat "$DIR/p.json")"'$pl$::jsonb)' >/dev/null

as_svc() { q -c "set role service_role; $1"; }
# ---- daily set: one per user/day, retries reuse it, pool-limited count ----
A1=$(as_svc "select public.ensure_daily_assignment('$U1')")
A1b=$(as_svc "select public.ensure_daily_assignment('$U1')")
ok "retry reuses same daily set" "$A1" "$A1b"
ok "set holds actual eligible count (3), no invented items" "$(q -c "select count(*) from public.daily_assignment_items where assignment_id='$A1'")" "3"
ok "distinct questions" "$(q -c "select count(distinct question_id) from public.daily_assignment_items where assignment_id='$A1'")" "3"
ok "unseen reason recorded" "$(q -c "select bool_and(reason='unseen') from public.daily_assignment_items where assignment_id='$A1'")" "t"
for i in 1 2 3 4 5 6; do as_svc "select public.ensure_daily_assignment('$U2')" >/dev/null & done; wait
ok "6 concurrent creations -> one set" "$(q -c "select count(*) from public.daily_assignments where user_id='$U2'")" "1"
ok "concurrent set has no duplicate items" "$(q -c "select count(*) from public.daily_assignment_items where user_id='$U2'")" "3"
# ---- study-day boundary from saved reset time ----
q -c "delete from public.daily_assignments where user_id='$U1'; insert into public.user_preferences (user_id, timezone, reset_time) values ('$U1', 'UTC', '00:00');" >/dev/null
as_svc "select public.ensure_daily_assignment('$U1')" >/dev/null
ok "UTC 00:00 reset -> today's UTC date" "$(q -c "select study_day = (now() at time zone 'UTC')::date from public.daily_assignments where user_id='$U1'")" "t"
q -c "delete from public.daily_assignments where user_id='$U1'; update public.user_preferences set reset_time='23:59' where user_id='$U1';" >/dev/null
as_svc "select public.ensure_daily_assignment('$U1')" >/dev/null
ok "23:59 reset -> previous day before the reset" "$(q -c "select study_day = ((now() at time zone 'UTC') - time '23:59')::date and study_day < (now() at time zone 'UTC')::date + 1 from public.daily_assignments where user_id='$U1'")" "t"

# ---- revision tied to committed attempts; replay never advances twice ----
QID=$(q -c "select id from public.questions where number=1")
rec() { # submission status marks
  as_svc "select public.practice_record_attempt('$U1', '$1', repeat('a',64), '$QID', null, null, '$2', $3::smallint,
    (select (c->'key'->>'id')::uuid from (select private.practice_context('$QID') c) x), 'gate-2026-v1',
    (select md5(private.practice_context('$QID')::text)), 5)->>'outcome'"; }
S1=00000000-0000-4000-8000-0000000000c1; S2=00000000-0000-4000-8000-0000000000c2; S3=00000000-0000-4000-8000-0000000000c3
ok "wrong attempt saved" "$(rec $S1 wrong -1)" "created"
ok "wrong -> interval 1" "$(q -c "select interval_days||'/'||reviews from public.revision_items where user_id='$U1'")" "1/1"
ok "replay returns original" "$(rec $S1 wrong -1)" "replay"
ok "replay does not touch revision" "$(q -c "select interval_days||'/'||reviews from public.revision_items where user_id='$U1'")" "1/1"
q -c "update public.revision_items set due_at = now() - interval '1 minute' where user_id='$U1'" >/dev/null
ok "due correct review saved" "$(rec $S2 correct 3)" "created"
ok "due correct -> advances to 3" "$(q -c "select interval_days from public.revision_items where user_id='$U1'")" "3"
ok "retry of that review is a replay" "$(rec $S2 correct 3)" "replay"
ok "new correct before due does not advance" "$(rec $S3 correct 3)/$(q -c "select interval_days from public.revision_items where user_id='$U1'")" "created/3"
ok "attempts counted once each" "$(q -c "select count(*) from public.attempts where user_id='$U1'")" "3"

# ---- isolation + privileges ----
as_svc "select public.mark_for_revision('$U2', '$QID')" >/dev/null
q -c "insert into public.bookmarks values ('$U1', '$QID')" >/dev/null
asu() { q -c "set role authenticated; set request.jwt.claim.sub = '$1'; $2"; }
ok "U2 sees only own revision rows" "$(asu $U2 "select count(*) from public.revision_items")" "1"
ok "U2 cannot see U1 bookmark" "$(asu $U2 "select count(*) from public.bookmarks")" "0"
ok "U2 cannot bookmark as U1" "$(asu $U2 "insert into public.bookmarks values ('$U1', (select id from public.questions where number=2))" 2>&1 | grep -c 'row-level security')" "1"
ok "U2 cannot read U1 daily set" "$(asu $U2 "select count(*) from public.daily_assignments where user_id='$U1'")" "0"
ok "learner cannot run daily generator" "$(asu $U2 "select public.ensure_daily_assignment('$U2')" 2>&1 | grep -c 'permission denied')" "1"
ok "learner cannot mark revision RPC" "$(asu $U2 "select public.mark_for_revision('$U2', '$QID')" 2>&1 | grep -c 'permission denied')" "1"
ok "learner cannot write mini-tests" "$(asu $U2 "insert into public.mini_tests (user_id, duration_sec, deadline_at) values ('$U2', 600, now()+interval '10 min')" 2>&1 | grep -c 'permission denied')" "1"
ok "learner checklist own write works" "$(asu $U2 "insert into public.daily_checklist (user_id, study_day, task, done) values ('$U2', current_date, 1, true) returning task")" "1"
ok "one active mini-test per user" "$(as_svc "insert into public.mini_tests (user_id, duration_sec, deadline_at) values ('$U1', 600, now()+interval '10 min'); insert into public.mini_tests (user_id, duration_sec, deadline_at) values ('$U1', 600, now()+interval '10 min')" 2>&1 | grep -c 'duplicate key')" "1"
ok "generator covers configured users" "$(as_svc "select private.generate_due_daily()")" "1"

echo "# $PASS passed, $FAIL failed"
[ "$FAIL" = 0 ]
