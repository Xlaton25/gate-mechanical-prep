#!/usr/bin/env bash
# Real PostgreSQL rehearsal of db/migrations 000006 (view revision + create-only pilot import).
# Starts a throwaway local cluster in /tmp, simulates Supabase roles, and uses ONLY synthetic
# rows — no real questions, keys or solutions appear here or in the payload. Never touches a remote.
# Usage: bash db/tests/pilot_import.pg.sh
set -euo pipefail
# initdb refuses root; re-run as an unprivileged user when needed.
if [ "$(id -u)" = 0 ]; then exec setpriv --reuid=65534 --regid=65534 --clear-groups env HOME=/tmp PATH="$PATH" bash "$(readlink -f "$0")"; fi
DIR=$(mktemp -d /tmp/pgpilot.XXXX)
M="$(cd "$(dirname "$0")/../migrations" && pwd)"
PORT=${PGPORT_REHEARSAL:-55441}
initdb -D "$DIR/data" -U postgres -A trust >/dev/null
pg_ctl -D "$DIR/data" -o "-k $DIR -p $PORT -c listen_addresses=''" -l "$DIR/log" -w start >/dev/null
trap 'pg_ctl -D "$DIR/data" -m immediate stop >/dev/null 2>&1; rm -rf "$DIR"' EXIT
q() { psql -X -qAt -v ON_ERROR_STOP=1 -h "$DIR" -p "$PORT" -U postgres -d postgres "$@"; }
PASS=0; FAIL=0
ok() { if [ "$2" = "$3" ]; then PASS=$((PASS+1)); echo "ok - $1"; else FAIL=$((FAIL+1)); echo "NOT OK - $1 (got '$2', want '$3')"; fi; }
jf() { python3 -c "import json,sys; d=json.loads(sys.argv[1]); print(eval(sys.argv[2]))" "$1" "$2"; }
cnt() { q -c "select count(*) from $1"; }
# payload file -> jsonb argument, dollar-quoted so no escaping of the JSON text is needed
imp() { q -c 'select public.pilot_import($pl$'"$(cat "$1")"'$pl$::jsonb)'; }

q -c "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth; create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as \$\$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid \$\$;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;" >/dev/null
for f in 20261027000001_core_schema 20261027000002_security 20261027000003_integrity_hardening \
         20261028000004_practice_submission 20261028000005_practice_hardening 20261028000006_view_revision_and_pilot_import; do
  q -f "$M/$f.sql" >/dev/null
done

# ---------- synthetic payload + deliberately broken variants ----------
python3 - "$DIR" <<'PY'
import json, os, sys
D = sys.argv[1]
def q1(**o):
    x = {"number": 1, "source_page": 2, "type": "MCQ", "marks": 1,
         "topic_path": ["Synthetic Subject", "Synthetic Area"],
         "body_md": "Synthetic question body v1",
         "options": [{"option_id": "A", "body_md": "alpha"}, {"option_id": "B", "body_md": "beta"}],
         "key": {"provenance": "official", "provenance_verified": True, "mcq_option": "B"},
         "solution": {"provenance": "authored", "body_md": "Synthetic solution v1"}}
    x.update(o); return x
def q2(**o):
    x = {"number": 2, "source_page": 3, "type": "NAT", "marks": 2,
         "topic_path": ["Synthetic Subject", "Synthetic Area"],
         "body_md": "Synthetic NAT body",
         "options": [],
         "key": {"provenance": "official", "provenance_verified": True,
                 "nat_ranges": [{"min": "1.50", "max": "2.00"}]},
         "solution": {"provenance": "authored", "body_md": "Synthetic NAT solution"}}
    x.update(o); return x
def base(**o):
    p = {"format_version": 1, "exam_year": 2026, "session_label": "synthetic",
         "marking_policy_id": "gate-2026-v1", "validation_date": "2026-10-28",
         "source": {"file_name": "SYNTHETIC2026.pdf", "page_count": 10,
                    "sha256": "a" * 64, "paper_url": "https://example.invalid/paper",
                    "key_url": "https://example.invalid/key", "identity": "synthetic"},
         "questions": [q1(), q2()]}
    p.update(o); return p
def w(name, obj):
    with open(os.path.join(D, name + ".json"), "w") as f:
        json.dump(obj, f)
w("base", base())
o = q1(); o["options"][1]["body_md"] = "beta reworded";            w("opt_body", base(questions=[o, q2()]))
o = q1(); o["body_md"] = "Synthetic question body v2";             w("q_body", base(questions=[o, q2()]))
o = q1(); o["key"]["mcq_option"] = "A";                            w("key_move", base(questions=[o, q2()]))
o = q1(); o["key"]["mcq_option"] = "E";                            w("key_missing", base(questions=[o, q2()]))
o = q2(); o["options"] = [{"option_id": "A", "body_md": "x"}, {"option_id": "B", "body_md": "y"}]
                                                                  w("nat_opts", base(questions=[q1(), o]))
o = q2(); o["key"]["nat_ranges"] = [{"min": "abc", "max": "2.00"}]; w("nat_bad", base(questions=[q1(), o]))
o = q2(); o["key"]["nat_ranges"] = [{"min": "1.50", "max": "1.00"}]; w("nat_inverted", base(questions=[q1(), o]))
o = q1(); o["key"]["provenance_verified"] = False;                  w("key_unverified", base(questions=[o, q2()]))
o = q1(); o["solution"]["body_md"] = "";                            w("no_solution", base(questions=[o, q2()]))
w("dup_number", base(questions=[q1(), q1()]))
w("wrong_policy", base(marking_policy_id="gate-2027-v1"))
w("bad_sha", base(source={"file_name": "SYNTHETIC2026.pdf", "page_count": 10, "sha256": "nope"}))
w("extra", base(questions=[q1(), q2(), q1(number=3, source_page=4)]))
PY

# ---------- 1. first import ----------
R=$(imp "$DIR/base.json")
ok "first run imports"                "$(jf "$R" "d['outcome']")" imported
ok "created 2 questions"             "$(jf "$R" "d['created']['questions']")" 2
ok "created 2 options"               "$(jf "$R" "d['created']['options']")" 2
ok "created 2 answer keys"           "$(jf "$R" "d['created']['keys']")" 2
ok "created 1 NAT range"             "$(jf "$R" "d['created']['nat_ranges']")" 1
ok "created 2 solutions"             "$(jf "$R" "d['created']['solutions']")" 2
ok "created 2 syllabus topics"       "$(jf "$R" "d['created']['topics']")" 2
ok "no key material in the reply"    "$(jf "$R" "sorted(d)")" "['created', 'exam_year', 'job_id', 'marking_policy_id', 'outcome', 'payload_md5', 'paper_id', 'session_label', 'source_file_id']"
ok "audit job recorded"              "$(cnt "private.import_jobs")" 1
ok "job succeeded"                   "$(q -c "select status from private.import_jobs")" succeeded
ok "paper published for 2026"        "$(cnt "public.papers where exam_year=2026 and session_label='synthetic' and status='published' and marking_policy_id='gate-2026-v1'")" 1
ok "questions validated"             "$(cnt "public.questions where validation_state='validated'")" 2
ok "options stored"                  "$(cnt "public.question_options")" 2
ok "keys official and verified"      "$(cnt "private.answer_keys where provenance='official' and provenance_verified and version=1")" 2
ok "NAT bounds kept as exact text"   "$(q -c "select min_value::text||'-'||max_value::text from private.answer_key_nat_ranges")" "1.50-2.00"
ok "solutions reviewed and bound"    "$(cnt "private.solutions where reviewed and answer_key_id is not null and provenance='authored'")" 2
ok "source labelled partial pilot"   "$(cnt "private.source_files where file_name='SYNTHETIC2026.pdf' and notes && array[select unnest(array['partial pilot: 2 questions reviewed and imported; the full paper is not processed'])]")" 1
ok "provenance recorded"             "$(cnt "private.question_provenance where source_page in (2,3)")" 2
ok "review audit recorded"           "$(cnt "private.question_validations where to_state='validated'")" 2

# ---------- 2. exact re-run is a no-op ----------
R=$(imp "$DIR/base.json")
ok "exact re-run is a no-op"         "$(jf "$R" "d['outcome']")" no-op
ok "no-op adds no question"          "$(cnt "public.questions")" 2
ok "no-op adds no option"            "$(cnt "public.question_options")" 2
ok "no-op adds no key"               "$(cnt "private.answer_keys")" 2
ok "no-op adds no NAT range"         "$(cnt "private.answer_key_nat_ranges")" 1
ok "no-op adds no solution"          "$(cnt "private.solutions")" 2
ok "no-op adds no topic"             "$(cnt "public.syllabus_topics")" 2
ok "no-op adds no provenance"        "$(cnt "private.question_provenance")" 2
ok "no-op adds no audit row"         "$(cnt "private.import_jobs")" 1

# ---------- 3. differing content aborts and writes nothing ----------
for v in opt_body q_body key_move key_unverified nat_bad nat_inverted; do
  before=$(cnt "public.questions"); beforeo=$(cnt "public.question_options"); beforek=$(cnt "private.answer_keys")
  E=$(imp "$DIR/$v.json" 2>&1 || true)
  ok "$v aborts"                     "$(echo "$E" | grep -c 'ERROR')" 1
  ok "$v wrote no question"          "$(cnt "public.questions")" "$before"
  ok "$v wrote no option"            "$(cnt "public.question_options")" "$beforeo"
  ok "$v wrote no key"               "$(cnt "private.answer_keys")" "$beforek"
done
ok "reworded option detected"        "$(imp "$DIR/opt_body.json" 2>&1 || true | grep -c 'option .* differs')" 1

# ---------- 4. invalid payloads are rejected before any write ----------
for v in key_missing nat_opts dup_number wrong_policy bad_sha no_solution nat_opts; do
  E=$(imp "$DIR/$v.json" 2>&1 || true)
  ok "$v rejected"                   "$(echo "$E" | grep -c 'ERROR')" 1
done
ok "nothing extra written by rejects" "$(cnt "public.questions")" 2

# ---------- 5. partial re-run adds only the missing question ----------
R=$(imp "$DIR/extra.json")
ok "extra question imports"           "$(jf "$R" "d['outcome']")" imported
ok "extra run created 1 question"    "$(jf "$R" "d['created']['questions']")" 1
ok "extra run created 0 options"     "$(jf "$R" "d['created']['options']")" 0

# ---------- 6. view revision ----------
PAP=$(q -c "select id from public.papers where session_label='synthetic'")
Q1=$(q -c "select id from public.questions where paper_id='$PAP' and number=1")
K1=$(q -c "select id from private.answer_keys where question_id='$Q1' and version=1")
U1=00000000-0000-4000-8000-0000000000a1
q -c "insert into auth.users values ('$U1')" >/dev/null
REV=$(q -c "set role service_role; select public.practice_question_revision('$Q1')")
FP=$(q -c "set role service_role; select public.practice_scoring_context('$Q1')->>'fingerprint'")
ok "revision is 32 hex"              "$(printf '%s' "$REV" | grep -c '^[0-9a-f]\{32\}$')" 1
ok "revision equals the scoring fingerprint" "$REV" "$FP"

H1=$(printf 'a%.0s' {1..64}); S1=00000000-0000-4000-8000-00000000e101
rec() { q -c "set role service_role; select public.practice_record_attempt('$U1','$1','$2','$Q1',null,'{\"kind\":\"MCQ\",\"option\":\"A\"}','wrong',-1::smallint,'$K1','gate-2026-v1','${3:-$REV}',10)::text"; }
R=$(rec $S1 $H1)
ok "save with the viewed revision created" "$(jf "$R" "d['outcome']")" created
ID1=$(jf "$R" "d['attempt']['id']")
ok "solution snapshot returned"      "$(jf "$R" "d['solution_md']")" "Synthetic solution v1"

# option wording edit changes what a learner saw -> the old view is stale
q -c "update public.question_options set body_md='beta reworded' where question_id='$Q1' and option_id='B'" >/dev/null
REV2=$(q -c "set role service_role; select public.practice_question_revision('$Q1')")
ok "option body edit changes the revision" "$([ "$REV2" != "$REV" ] && echo changed)" changed
S2=00000000-0000-4000-8000-00000000e102
R=$(rec $S2 $H1)
ok "save against the stale viewed revision is refused" "$(jf "$R" "d['outcome']")" stale
ok "stale save wrote nothing"        "$(cnt "public.attempts where submission_id='$S2'")" 0
ok "fresh revision accepts the same answer" "$(rec $S2 $H1 "$REV2" | jf /dev/stdin "json.loads(sys.argv[1])['outcome']" 2>/dev/null || q -c "set role service_role; select public.practice_record_attempt('$U1','$S2','$H1','$Q1',null,'{\"kind\":\"MCQ\",\"option\":\"A\"}','wrong',-1::smallint,'$K1','gate-2026-v1','$REV2',10)::text" | jf /dev/stdin "json.loads(sys.argv[1])['outcome']")" created

# question wording edit also changes the revision
q -c "update public.questions set body_md='Synthetic question body v2' where id='$Q1'" >/dev/null
REV3=$(q -c "set role service_role; select public.practice_question_revision('$Q1')")
ok "question body edit changes the revision" "$([ "$REV3" != "$REV2" ] && echo changed)" changed

# key change changes the revision
q -c "update private.answer_keys set mcq_option='A' where id='$K1'" >/dev/null
REV4=$(q -c "set role service_role; select public.practice_question_revision('$Q1')")
ok "answer key edit changes the revision" "$([ "$REV4" != "$REV3" ] && echo changed)" changed

# lost-response replay survives retirement of the question
q -c "update public.questions set validation_state='in_review', validated_at=null where id='$Q1'" >/dev/null
R=$(rec $S1 $H1)
ok "replay after retirement returns the original" "$(jf "$R" "d['outcome'] + ':' + d['attempt']['id']")" "replay:$ID1"
ok "replay keeps the original solution snapshot"  "$(jf "$R" "d['solution_md']")" "Synthetic solution v1"
ok "replay of a stale view still needs no current content" "$(rec $S1 $H1)" "$(printf '%s' "$R" | tr -d '\n')"

# ---------- 7. privilege boundaries ----------
for role in anon authenticated; do
  E=$(q -c "set role $role; select public.pilot_import('{}'::jsonb)" 2>&1 || true)
  ok "$role cannot execute pilot_import" "$(echo "$E" | grep -c 'permission denied')" 1
  E=$(q -c "set role $role; select public.practice_question_revision('$Q1')" 2>&1 || true)
  ok "$role cannot execute practice_question_revision" "$(echo "$E" | grep -c 'permission denied')" 1
  E=$(q -c "set role $role; select * from private.answer_keys" 2>&1 || true)
  ok "$role cannot read answer keys" "$(echo "$E" | grep -c 'permission denied')" 1
done
ok "new functions invoker with empty search_path" \
  "$(q -c "select bool_and(not prosecdef and array_to_string(proconfig, ',') like '%search_path=\"\"%') from pg_proc where proname in ('pilot_import','practice_question_revision','practice_context')")" t

echo "# pass $PASS fail $FAIL"
[ "$FAIL" -eq 0 ]
