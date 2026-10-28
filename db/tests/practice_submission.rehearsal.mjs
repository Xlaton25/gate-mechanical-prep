import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync } from "node:fs";

const db = new PGlite({ extensions: { btree_gist } });
const M = new URL("../migrations/", import.meta.url).pathname;
await db.exec(`
create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;
create schema extensions; create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
grant usage on schema public, extensions, auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;
`);
for (const f of ["20261027000001_core_schema.sql", "20261027000002_security.sql", "20261027000003_integrity_hardening.sql", "20261028000004_practice_submission.sql"]) {
  await db.exec(readFileSync(M + f, "utf8"));
}
let pass = 0, fail = 0;
const ok = (name, cond) => { cond ? pass++ : fail++; console.log(`${cond ? "ok" : "NOT OK"} - ${name}`); };
const denied = async (name, sql) => {
  try { await db.exec(sql); ok(name, false); } catch (e) { ok(name, /permission denied/.test(e.message)); }
  await db.exec("reset role");
};
const U1 = "00000000-0000-4000-8000-0000000000a1", U2 = "00000000-0000-4000-8000-0000000000a2";
const Q = "00000000-0000-4000-8000-00000000b001", P = "00000000-0000-4000-8000-00000000c001";
const K1 = "00000000-0000-4000-8000-00000000d001";
// Synthetic, ephemeral rehearsal fixture only.
await db.exec(`
insert into auth.users values ('${U1}'), ('${U2}');
set role service_role;
insert into public.papers (id, exam_year, session_label, marking_policy_id, status) values ('${P}', 2026, 'synthetic', 'gate-2026-v1', 'published');
insert into public.questions (id, paper_id, number, type, marks, body_md, validation_state, validated_at) values ('${Q}', '${P}', 1, 'MCQ', 1, 'Synthetic question', 'validated', now());
insert into public.question_options values ('${Q}','A','a'),('${Q}','B','b'),('${Q}','C','c'),('${Q}','D','d');
insert into private.answer_keys (id, question_id, question_type, version, provenance, provenance_verified, mcq_option) values ('${K1}', '${Q}', 'MCQ', 1, 'derived', true, 'B');
insert into private.solutions (question_id, version, body_md, provenance) values ('${Q}', 1, 'Synthetic solution', 'authored');
reset role;`);

await db.exec("set role service_role");
const ctx = (await db.query(`select public.practice_scoring_context($1) c`, [Q])).rows[0].c;
ok("context has latest key and policy", ctx.key.id === K1 && ctx.policy.id === "gate-2026-v1" && ctx.paper_year === 2026);
ok("2026 policy verified with 1/3, 2/3", ctx.policy.verified && ctx.policy.mcq_penalty_thirds_1 === 1 && ctx.policy.mcq_penalty_thirds_2 === 2);
const H1 = "a".repeat(64), H2 = "b".repeat(64), S1 = "00000000-0000-4000-8000-00000000e001";
const rec = (sub, hash, fp, user = U1, key = K1) => db.query(
  `select public.practice_record_attempt($1,$2,$3,$4,null,$5,'wrong',-1::smallint,$6,'gate-2026-v1',$7,10) r`,
  [user, sub, hash, Q, JSON.stringify({ kind: "MCQ", option: "A" }), key, fp]).then((x) => x.rows[0].r);
const r1 = await rec(S1, H1, ctx.fingerprint);
ok("first save created", r1.outcome === "created" && r1.attempt.marks_thirds === -1 && !("request_hash" in r1.attempt));
const r2 = await rec(S1, H1, ctx.fingerprint);
ok("same request replays original attempt", r2.outcome === "replay" && r2.attempt.id === r1.attempt.id);
const r3 = await rec(S1, H2, ctx.fingerprint);
ok("same submission id + altered payload conflicts", r3.outcome === "conflict" && !r3.attempt);
const r4 = await rec(S1, H1, ctx.fingerprint, U2);
ok("submission id is scoped per user", r4.outcome === "created" && r4.attempt.user_id === U2);
const cnt = (await db.query(`select count(*)::int n from public.attempts where submission_id = $1`, [S1])).rows[0].n;
ok("exactly one row per user+submission", cnt === 2);
const r5 = await rec("00000000-0000-4000-8000-00000000e002", H1, "0".repeat(32));
ok("changed fingerprint is stale", r5.outcome === "stale");
try { await db.query(`select public.practice_record_attempt($1,$2,$3,$4,null,null,'invalid',0::smallint,$5,'gate-2026-v1',$6,null)`, [U1, "00000000-0000-4000-8000-00000000e003", H1, Q, K1, ctx.fingerprint]); ok("invalid status rejected", false); }
catch (e) { ok("invalid status rejected", /not recordable/.test(e.message)); }
await db.exec("reset role");
// newer UNVERIFIED key: must not fall back to older verified key
await db.exec(`insert into private.answer_keys (question_id, question_type, version, provenance, provenance_verified, mcq_option, supersedes_id) values ('${Q}','MCQ',2,'derived',false,'C','${K1}')`);
await db.exec("set role service_role");
const ctx2 = (await db.query(`select public.practice_scoring_context($1) c`, [Q])).rows[0].c;
ok("latest key is v2 unverified (no fallback)", ctx2.key.version === 2 && ctx2.key.verified === false);
const r6 = await rec("00000000-0000-4000-8000-00000000e004", H1, ctx.fingerprint);
ok("old key/fingerprint after new key version is stale", r6.outcome === "stale");
const sol = (await db.query(`select public.practice_solution($1) s`, [Q])).rows[0].s;
ok("solution readable by trusted server", sol === "Synthetic solution");
await db.exec("reset role");
await db.exec(`update public.questions set validation_state='in_review', validated_at=null where id='${Q}'`);
await db.exec("set role service_role");
ok("unvalidated question has no context", (await db.query(`select public.practice_scoring_context($1) c`, [Q])).rows[0].c === null);
await db.exec("reset role");

for (const role of ["anon", "authenticated"]) {
  await denied(`${role} cannot execute record RPC`, `set role ${role}; select public.practice_record_attempt('${U1}','${S1}','${H1}','${Q}',null,null,'correct',3::smallint,'${K1}','gate-2026-v1','${"0".repeat(32)}',null)`);
  await denied(`${role} cannot execute context RPC`, `set role ${role}; select public.practice_scoring_context('${Q}')`);
  await denied(`${role} cannot execute solution RPC`, `set role ${role}; select public.practice_solution('${Q}')`);
  await denied(`${role} cannot execute private context`, `set role ${role}; select private.practice_context('${Q}')`);
  await denied(`${role} cannot read answer keys`, `set role ${role}; select * from private.answer_keys`);
}
await denied("authenticated cannot insert attempts directly", `set role authenticated; set request.jwt.claim.sub='${U1}'; insert into public.attempts (user_id, submission_id, request_hash, context_fingerprint, question_id, status, marks_thirds, key_version_id, marking_policy_id) values ('${U1}', gen_random_uuid(), '${H1}', '${"0".repeat(32)}', '${Q}', 'correct', 3, '${K1}', 'gate-2026-v1')`);
await db.exec(`set role authenticated; set request.jwt.claim.sub='${U2}'`);
const own = (await db.query(`select user_id from public.attempts`)).rows;
ok("learner sees only own attempts", own.length === 1 && own[0].user_id === U2);
await db.exec("reset role");
const defs = (await db.query(`select p.proname, p.prosecdef, p.proconfig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where p.proname like 'practice_%'`)).rows;
ok("all practice RPCs are invoker with empty search_path", defs.length === 4 && defs.every((d) => !d.prosecdef && String(d.proconfig).includes('search_path=""')));
console.log(`# pass ${pass} fail ${fail}`);
process.exit(fail ? 1 : 0);
