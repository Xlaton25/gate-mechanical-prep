#!/usr/bin/env bash
# Real PostgreSQL (multi-session) rehearsal of db/migrations 000001–000006.
# Starts a throwaway local cluster in /tmp, simulates Supabase roles, uses ONLY synthetic rows,
# and never touches a remote project. Usage: bash db/tests/practice_hardening.pg.sh
set -euo pipefail
# initdb refuses root; re-run as an unprivileged user when needed.
if [ "$(id -u)" = 0 ]; then exec setpriv --reuid=65534 --regid=65534 --clear-groups env HOME=/tmp PATH="$PATH" bash "$(readlink -f "$0")"; fi
DIR=$(mktemp -d /tmp/pgrehearsal.XXXX)
M="$(cd "$(dirname "$0")/../migrations" && pwd)"
PORT=${PGPORT_REHEARSAL:-55439}
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
for f in 20261027000001_core_schema 20261027000002_security 20261027000003_integrity_hardening 20261028000004_practice_submission 20261028000005_practice_hardening 20261028000006_view_revision_and_pilot_import \
         20261028000007_practice_source 20261028000008_practice_view_and_import_hardening; do
  q -f "$M/$f.sql" >/dev/null
done

U1=00000000-0000-4000-8000-0000000000a1; U2=00000000-0000-4000-8000-0000000000a2
Q=00000000-0000-4000-8000-00000000b001; P=00000000-0000-4000-8000-00000000c001
K1=00000000-0000-4000-8000-00000000d001; SOL1=00000000-0000-4000-8000-00000000f001
H1=$(printf 'a%.0s' {1..64}); H2=$(printf 'b%.0s' {1..64})
q -c "insert into auth.users values ('$U1'), ('$U2');
set role service_role;
insert into public.papers (id, exam_year, session_label, marking_policy_id, status) values ('$P', 2026, 'synthetic', 'gate-2026-v1', 'published');
insert into public.questions (id, paper_id, number, type, marks, body_md, validation_state, validated_at) values ('$Q', '$P', 1, 'MCQ', 1, 'Synthetic', 'validated', now());
insert into public.question_options values ('$Q','A','a'),('$Q','B','b'),('$Q','C','c'),('$Q','D','d');
insert into private.answer_keys (id, question_id, question_type, version, provenance, provenance_verified, mcq_option) values ('$K1', '$Q', 'MCQ', 1, 'derived', true, 'B');
insert into private.solutions (id, question_id, version, body_md, provenance, answer_key_id, reviewed) values ('$SOL1', '$Q', 1, 'Synthetic solution v1', 'authored', '$K1', true);
insert into private.solutions (question_id, version, body_md, provenance, reviewed) values ('$Q', 2, 'Unbound newer solution', 'authored', true);" >/dev/null

FP=$(q -c "set role service_role; select public.practice_scoring_context('$Q')->>'fingerprint'")
rec() { # sub hash [user] [fp]
  q -c "set role service_role; select public.practice_record_attempt('${3:-$U1}','$1','$2','$Q',null,'{\"kind\":\"MCQ\",\"option\":\"A\"}','wrong',-1::smallint,'$K1','gate-2026-v1','${4:-$FP}',10)::text"
}
jf() { python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(eval(sys.argv[2]))" "$1" "$2"; }

# ---- replay-first and solution snapshot ----
S1=00000000-0000-4000-8000-00000000e001
R=$(rec $S1 $H1); ok "first save created" "$(jf "$R" "d['outcome']")" created
ok "snapshot is the reviewed solution for the scored key (not newest unbound)" "$(jf "$R" "d['solution_md']")" "Synthetic solution v1"
ID1=$(jf "$R" "d['attempt']['id']")
ok "no request hash / user id in result" "$(jf "$R" "sorted(d['attempt'])")" "['id', 'marks_thirds', 'question_id', 'status', 'submitted_at']"
q -c "update private.answer_keys set provenance_verified=false where id='$K1';
      update public.questions set validation_state='in_review', validated_at=null where id='$Q';" >/dev/null
R=$(rec $S1 $H1); ok "replay after key unverified + question retired returns original" "$(jf "$R" "d['outcome'] + ':' + d['attempt']['id']")" "replay:$ID1"
ok "replay returns the same solution snapshot" "$(jf "$R" "d['solution_md']")" "Synthetic solution v1"
R=$(rec $S1 $H2); ok "altered hash conflicts even when content retired" "$(jf "$R" "d['outcome']")" conflict
L=$(q -c "set role service_role; select coalesce(public.practice_lookup_submission('$U2','$S1','$H1')::text,'null')")
ok "lookup is per user" "$L" null
q -c "update private.answer_keys set provenance_verified=true where id='$K1';
      update public.questions set validation_state='validated', validated_at=now() where id='$Q';" >/dev/null
FP=$(q -c "set role service_role; select public.practice_scoring_context('$Q')->>'fingerprint'")
E=$(q -c "update private.solutions set body_md='edited' where id='$SOL1'" 2>&1 || true)
ok "solutions are immutable" "$(echo "$E" | grep -c 'ERROR:.*immutable')" 1
E=$(q -c "set role service_role; select public.practice_solution('$Q')" 2>&1 || true)
ok "newest-arbitrary practice_solution RPC removed" "$(echo "$E" | grep -c 'does not exist')" 1

# ---- concurrency (real separate sessions) ----
# (a) In-flight save blocks a content writer until it commits.
S2=00000000-0000-4000-8000-00000000e002
( q -c "begin; set role service_role; select public.practice_record_attempt('$U1','$S2','$H1','$Q',null,'{\"kind\":\"MCQ\",\"option\":\"A\"}','wrong',-1::smallint,'$K1','gate-2026-v1','$FP',10); select pg_sleep(2); commit;" >/dev/null ) &
sleep 0.5
T0=$(date +%s.%N)
q -c "update private.answer_keys set mcq_option='C' where id='$K1'" >/dev/null
T1=$(date +%s.%N); wait
ok "key writer waited for the in-flight save (>=1.2s)" "$(python3 -c "print($T1-$T0>=1.2)")" True
ok "save committed with original key" "$(q -c "select count(*) from public.attempts where submission_id='$S2'")" 1

# (b) Writer that started first (new key version mid-flight) forces the save to recompute -> stale.
FP=$(q -c "set role service_role; select public.practice_scoring_context('$Q')->>'fingerprint'")
( q -c "begin; insert into private.answer_keys (question_id, question_type, version, provenance, provenance_verified, mcq_option, supersedes_id) values ('$Q','MCQ',2,'derived',true,'D','$K1'); select pg_sleep(2); commit;" >/dev/null ) &
sleep 0.5
S3=00000000-0000-4000-8000-00000000e003
R=$(rec $S3 $H1); wait
ok "save during uncommitted newer key waits then reports stale" "$(jf "$R" "d['outcome']")" stale
ok "stale save wrote nothing" "$(q -c "select count(*) from public.attempts where submission_id='$S3'")" 0

# (c) Simultaneous identical retries -> exactly one row, one created + one replay.
K2=$(q -c "select id from private.answer_keys where question_id='$Q' and version=2")
FP=$(q -c "set role service_role; select public.practice_scoring_context('$Q')->>'fingerprint'")
S4=00000000-0000-4000-8000-00000000e004
for i in 1 2 3; do
  ( q -c "set role service_role; select public.practice_record_attempt('$U1','$S4','$H1','$Q',null,null,'unanswered',0::smallint,'$K2','gate-2026-v1','$FP',null)->>'outcome'" > "$DIR/c$i" ) &
done
wait
ok "concurrent identical retries -> one row" "$(q -c "select count(*) from public.attempts where submission_id='$S4'")" 1
ok "outcomes are 1 created + 2 replay" "$(cat "$DIR"/c1 "$DIR"/c2 "$DIR"/c3 | sort | tr '\n' ' ')" "created replay replay "
ok "no reviewed solution for key v2 -> null snapshot" "$(q -c "select coalesce(solution_id::text,'null') from public.attempts where submission_id='$S4'")" null

# (d) Two different saves do not block each other (SHARE vs SHARE).
S5=00000000-0000-4000-8000-00000000e005; S6=00000000-0000-4000-8000-00000000e006
( q -c "begin; set role service_role; select public.practice_record_attempt('$U1','$S5','$H1','$Q',null,null,'unanswered',0::smallint,'$K2','gate-2026-v1','$FP',null); select pg_sleep(2); commit;" >/dev/null ) &
sleep 0.5; T0=$(date +%s.%N)
R=$(q -c "set role service_role; select public.practice_record_attempt('$U2','$S6','$H1','$Q',null,null,'unanswered',0::smallint,'$K2','gate-2026-v1','$FP',null)->>'outcome'")
T1=$(date +%s.%N); wait
ok "concurrent different saves are not serialised (<1s)" "$R:$(python3 -c "print($T1-$T0<1)")" created:True

# ---- privileges ----
for role in anon authenticated; do
  for fn in "public.practice_lookup_submission('$U1','$S1','$H1')" "private.practice_result('$ID1','replay')" "public.practice_record_attempt('$U1','$S1','$H1','$Q',null,null,'correct',3::smallint,'$K1','gate-2026-v1','$FP',null)"; do
    E=$(q -c "set role $role; select $fn" 2>&1 || true)
    ok "$role cannot execute ${fn%%(*}" "$(echo "$E" | grep -c 'permission denied')" 1
  done
  E=$(q -c "set role $role; select * from private.solutions" 2>&1 || true)
  ok "$role cannot read solutions" "$(echo "$E" | grep -c 'permission denied')" 1
done
ok "all practice functions invoker with empty search_path" \
  "$(q -c "select bool_and(not prosecdef and array_to_string(proconfig, ',') like '%search_path=\"\"%') from pg_proc where proname like 'practice_%'")" t

echo "# pass $PASS fail $FAIL"
[ "$FAIL" -eq 0 ]
