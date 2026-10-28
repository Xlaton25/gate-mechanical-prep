import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { accountMatches, responseSchema, type QuestionType } from "./practice-schema";
import {
  bookmarkInput, boundOnly, boundQuestion, checklistInput, draftInput, searchInput, startTestInput, testIdInput,
  type CorpusData, type DailyItem, type DailyReason, type MiniTestResult, type MiniTestView, type QuestionMeta, type R,
  type RevisionData, type RevisionEntry, type SearchData, type TodayData,
} from "./learning-schema";
import { rootOf, summarize, type AttemptFact, type TopicNode } from "./progress";

type Sb = typeof import("@/integrations/supabase/client").supabase;
const MISMATCH = { ok: false as const, error: "account_mismatch" as const };
const UNAVAILABLE = { ok: false as const, error: "unavailable" as const };
const log = (where: string, e: unknown) => console.error(`[learning] ${where} failed:`, (e as { code?: string })?.code ?? "unknown");

const QSEL = "id, number, type, marks, topic_id, papers!inner(exam_year, session_label)";
type QRow = { id: string; number: number; type: string; marks: number; topic_id: string | null; papers: unknown };

async function loadTopics(sb: Sb): Promise<Map<string, TopicNode>> {
  const { data, error } = await sb.from("syllabus_topics").select("id, name, parent_id").limit(2000);
  if (error) throw error;
  return new Map(data.map((t) => [t.id, { id: t.id, name: t.name, parentId: t.parent_id }]));
}
function toMeta(q: QRow, topics: Map<string, TopicNode>): QuestionMeta {
  const p = q.papers as { exam_year: number; session_label: string } | null;
  return {
    id: q.id, number: q.number, type: q.type as QuestionType, marks: q.marks,
    year: p?.exam_year ?? 0, session: p?.session_label ?? "",
    topic: q.topic_id ? topics.get(q.topic_id)?.name ?? null : null,
    subject: rootOf(topics, q.topic_id)?.name ?? null,
  };
}
async function loadAttempts(sb: Sb, userId: string) {
  const { data, error } = await sb
    .from("attempts")
    .select("question_id, status, marks_thirds, submitted_at, duration_sec, assignment_id, questions!inner(topic_id)")
    .eq("user_id", userId).neq("status", "invalid")
    .order("submitted_at", { ascending: false }).limit(2000);
  if (error) throw error;
  return data.map((a) => ({
    fact: {
      questionId: a.question_id, status: a.status as AttemptFact["status"], marksThirds: a.marks_thirds,
      submittedAt: a.submitted_at, durationSec: a.duration_sec, topicId: (a.questions as { topic_id: string | null } | null)?.topic_id ?? null,
    } satisfies AttemptFact,
    assignmentId: a.assignment_id,
  }));
}
async function loadPrefs(sb: Sb, userId: string) {
  const { data } = await sb.from("user_preferences").select("timezone, reset_time, daily_minutes").eq("user_id", userId).maybeSingle();
  return { tz: data?.timezone ?? "Asia/Kolkata", reset: (data?.reset_time ?? "04:00").slice(0, 5), dailyMinutes: data?.daily_minutes ?? null };
}

/** Today's persistent set (created at most once per study day, server-side), plus dashboard facts. */
export const getToday = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => boundOnly.parse(d))
  .handler(async ({ data, context }): Promise<R<{ today: TodayData }>> => {
    const { supabase: sb, userId } = context;
    if (!accountMatches(data.expectedUserId, userId)) return MISMATCH;
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) return { ok: false, error: "setup_pending" };
    try {
      const { ensureDaily, eligiblePool } = await import("@/server/learning/admin.server");
      const [assignmentId, pool, topics, prefs] = await Promise.all([ensureDaily(userId), eligiblePool(), loadTopics(sb), loadPrefs(sb, userId)]);
      const [a, items, attempts, check, due] = await Promise.all([
        sb.from("daily_assignments").select("study_day, timezone, reset_time").eq("id", assignmentId).single(),
        sb.from("daily_assignment_items").select(`position, reason, questions!inner(${QSEL})`).eq("assignment_id", assignmentId).order("position"),
        loadAttempts(sb, userId),
        sb.from("daily_checklist").select("study_day, task, done").eq("user_id", userId).order("study_day", { ascending: false }).limit(30),
        sb.from("revision_items").select("question_id", { count: "exact", head: true }).eq("user_id", userId).lte("due_at", new Date().toISOString()),
      ]);
      if (a.error || items.error || check.error || due.error) throw a.error ?? items.error ?? check.error ?? due.error;
      const day = a.data.study_day;
      const done = new Map<string, AttemptFact["status"]>();
      for (const x of attempts) if (x.assignmentId === assignmentId && !done.has(x.fact.questionId)) done.set(x.fact.questionId, x.fact.status);
      const dailyItems: DailyItem[] = items.data.map((it) => {
        const m = toMeta(it.questions as unknown as QRow, topics);
        return { ...m, position: it.position, reason: it.reason as DailyReason, done: done.has(m.id), lastStatus: done.get(m.id) ?? null };
      });
      return {
        ok: true,
        today: {
          assignmentId, studyDay: day, timezone: a.data.timezone, resetTime: a.data.reset_time.slice(0, 5),
          items: dailyItems, poolSize: pool.length, dueCount: due.count ?? 0,
          checklist: [1, 2, 3].map((t) => check.data.some((c) => c.study_day === day && c.task === t && c.done)),
          summary: summarize(attempts.map((x) => x.fact), topics, new Date(), prefs.tz, prefs.reset),
          dailyMinutes: prefs.dailyMinutes,
        },
      };
    } catch (e) {
      log("today", e);
      return UNAVAILABLE;
    }
  });

export const setChecklist = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => checklistInput.parse(d))
  .handler(async ({ data, context }): Promise<R<object>> => {
    if (!accountMatches(data.expectedUserId, context.userId)) return MISMATCH;
    const { error } = await context.supabase.from("daily_checklist")
      .upsert({ user_id: context.userId, study_day: data.studyDay, task: data.task, done: data.done, updated_at: new Date().toISOString() });
    if (error) { log("checklist", error); return UNAVAILABLE; }
    return { ok: true };
  });

export const getQuestionFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => boundQuestion.parse(d))
  .handler(async ({ data, context }): Promise<R<{ bookmarked: boolean; dueAt: string | null }>> => {
    const { supabase: sb, userId } = context;
    if (!accountMatches(data.expectedUserId, userId)) return MISMATCH;
    const [b, r] = await Promise.all([
      sb.from("bookmarks").select("question_id").eq("user_id", userId).eq("question_id", data.questionId).maybeSingle(),
      sb.from("revision_items").select("due_at").eq("user_id", userId).eq("kind", "question").eq("question_id", data.questionId).maybeSingle(),
    ]);
    if (b.error || r.error) { log("flags", b.error ?? r.error); return UNAVAILABLE; }
    return { ok: true, bookmarked: !!b.data, dueAt: r.data?.due_at ?? null };
  });

export const setBookmark = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => bookmarkInput.parse(d))
  .handler(async ({ data, context }): Promise<R<object>> => {
    const { supabase: sb, userId } = context;
    if (!accountMatches(data.expectedUserId, userId)) return MISMATCH;
    const { error } = data.on
      ? await sb.from("bookmarks").upsert({ user_id: userId, question_id: data.questionId }, { ignoreDuplicates: true })
      : await sb.from("bookmarks").delete().eq("user_id", userId).eq("question_id", data.questionId);
    if (error) { log("bookmark", error); return UNAVAILABLE; }
    return { ok: true };
  });

export const markForRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => boundQuestion.parse(d))
  .handler(async ({ data, context }): Promise<R<object>> => {
    if (!accountMatches(data.expectedUserId, context.userId)) return MISMATCH;
    try {
      const { markRevision } = await import("@/server/learning/admin.server");
      await markRevision(context.userId, data.questionId);
      return { ok: true };
    } catch (e) { log("mark", e); return UNAVAILABLE; }
  });

export const getRevision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => boundOnly.parse(d))
  .handler(async ({ data, context }): Promise<R<{ revision: RevisionData }>> => {
    const { supabase: sb, userId } = context;
    if (!accountMatches(data.expectedUserId, userId)) return MISMATCH;
    try {
      const topics = await loadTopics(sb);
      const [ri, bm, at] = await Promise.all([
        sb.from("revision_items").select(`due_at, interval_days, questions!inner(${QSEL})`).eq("user_id", userId).eq("kind", "question").order("due_at").limit(500),
        sb.from("bookmarks").select(`created_at, questions!inner(${QSEL})`).eq("user_id", userId).order("created_at", { ascending: false }).limit(500),
        sb.from("attempts").select(`status, submitted_at, questions!inner(${QSEL})`).eq("user_id", userId).neq("status", "invalid").order("submitted_at", { ascending: false }).limit(2000),
      ]);
      if (ri.error || bm.error || at.error) throw ri.error ?? bm.error ?? at.error;
      const now = new Date().toISOString();
      const rev = ri.data.map((r) => ({ ...toMeta(r.questions as unknown as QRow, topics), dueAt: r.due_at, intervalDays: r.interval_days }));
      const latest = new Map<string, RevisionEntry>();
      for (const a of at.data) {
        const m = toMeta(a.questions as unknown as QRow, topics);
        if (!latest.has(m.id)) latest.set(m.id, { ...m, lastStatus: a.status, lastAt: a.submitted_at });
      }
      return {
        ok: true,
        revision: {
          due: rev.filter((r) => r.dueAt <= now),
          upcoming: rev.filter((r) => r.dueAt > now),
          mistakes: [...latest.values()].filter((m) => m.lastStatus === "wrong" || m.lastStatus === "unanswered"),
          saved: bm.data.map((b) => toMeta(b.questions as unknown as QRow, topics)),
        },
      };
    } catch (e) { log("revision", e); return UNAVAILABLE; }
  });

const PAGE = 20;
const escapeLike = (s: string) => s.replace(/[\\%_,()]/g, (c) => `\\${c}`);

/** Learner-RLS search over validated published questions. Keys/solutions are never selected. */
export const searchQuestions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => searchInput.parse(d))
  .handler(async ({ data, context }): Promise<R<{ search: SearchData }>> => {
    const { supabase: sb, userId } = context;
    if (!accountMatches(data.expectedUserId, userId)) return MISMATCH;
    try {
      const topics = await loadTopics(sb);
      const [att, all] = await Promise.all([
        sb.from("attempts").select("question_id").eq("user_id", userId).neq("status", "invalid").limit(2000),
        sb.from("questions").select("id, papers!inner(exam_year)").eq("validation_state", "validated").limit(5000),
      ]);
      if (att.error || all.error) throw att.error ?? all.error;
      const attempted = new Set(att.data.map((a) => a.question_id));
      let query = sb.from("questions").select(`${QSEL}, body_md`, { count: "exact" }).eq("validation_state", "validated");
      if (data.q.trim()) query = query.ilike("body_md", `%${escapeLike(data.q.trim())}%`);
      if (data.year) query = query.eq("papers.exam_year", data.year);
      if (data.type) query = query.eq("type", data.type);
      if (data.marks) query = query.eq("marks", data.marks);
      if (data.topicId) {
        const ids = [...topics.values()].filter((t) => { for (let c: TopicNode | undefined = t, i = 0; c && i < 20; c = c.parentId ? topics.get(c.parentId) : undefined, i++) if (c.id === data.topicId) return true; return false; }).map((t) => t.id);
        query = query.in("topic_id", ids.length ? ids : [data.topicId]);
      }
      if (data.attempted !== "any") {
        const ids = [...attempted];
        if (data.attempted === "yes") query = query.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
        else if (ids.length) query = query.not("id", "in", `(${ids.join(",")})`);
      }
      const { data: rows, count, error } = await query.order("paper_id").order("number").range(data.page * PAGE, data.page * PAGE + PAGE - 1);
      if (error) throw error;
      const years = [...new Set(all.data.map((q) => (q.papers as unknown as { exam_year: number }).exam_year))].sort((a, b) => b - a);
      return {
        ok: true,
        search: {
          rows: rows.map((r) => ({
            ...toMeta(r as unknown as QRow, topics), attempted: attempted.has(r.id),
            snippet: r.body_md.replace(/\$\$?[^$]*\$\$?/g, "[math]").replace(/[#*|_`>]/g, " ").replace(/\s+/g, " ").trim().slice(0, 160),
          })),
          total: count ?? 0, corpus: all.data.length, years, topics: [...topics.values()], page: data.page, pageSize: PAGE,
        },
      };
    } catch (e) { log("search", e); return UNAVAILABLE; }
  });

export const getCorpus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => boundOnly.parse(d))
  .handler(async ({ data, context }): Promise<R<{ corpus: CorpusData }>> => {
    const { supabase: sb, userId } = context;
    if (!accountMatches(data.expectedUserId, userId)) return MISMATCH;
    try {
      const topics = await loadTopics(sb);
      const { data: qs, error } = await sb.from("questions").select("topic_id, marks, type, papers!inner(exam_year)").eq("validation_state", "validated").limit(5000);
      if (error) throw error;
      return { ok: true, corpus: { topics: [...topics.values()], counts: qs.map((q) => ({ topicId: q.topic_id, marks: q.marks, type: q.type as QuestionType, year: (q.papers as unknown as { exam_year: number }).exam_year })) } };
    } catch (e) { log("corpus", e); return UNAVAILABLE; }
  });

export const getAnalytics = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => boundOnly.parse(d))
  .handler(async ({ data, context }): Promise<R<{ summary: ReturnType<typeof summarize> }>> => {
    const { supabase: sb, userId } = context;
    if (!accountMatches(data.expectedUserId, userId)) return MISMATCH;
    try {
      const topics = await loadTopics(sb);
      const [att, prefs] = await Promise.all([loadAttempts(sb, userId), loadPrefs(sb, userId)]);
      return { ok: true, summary: summarize(att.map((a) => a.fact), topics, new Date(), prefs.tz, prefs.reset) };
    } catch (e) { log("analytics", e); return UNAVAILABLE; }
  });

/** The learner's own progress as JSON. No keys, key IDs, request hashes or solution text. */
export const exportProgress = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => boundOnly.parse(d))
  .handler(async ({ data, context }): Promise<R<{ json: string }>> => {
    const { supabase: sb, userId } = context;
    if (!accountMatches(data.expectedUserId, userId)) return MISMATCH;
    const [at, ri, bm, pr, da, mt] = await Promise.all([
      sb.from("attempts").select("question_id, assignment_id, status, marks_thirds, submitted_at, duration_sec, response").eq("user_id", userId).order("submitted_at").limit(5000),
      sb.from("revision_items").select("question_id, due_at, interval_days, reviews").eq("user_id", userId),
      sb.from("bookmarks").select("question_id, created_at").eq("user_id", userId),
      sb.from("user_preferences").select("daily_minutes, timezone, reset_time").eq("user_id", userId).maybeSingle(),
      sb.from("daily_assignments").select("id, study_day, generator_version, daily_assignment_items(position, question_id, reason)").eq("user_id", userId),
      sb.from("mini_tests").select("id, started_at, deadline_at, status, finalized_at, duration_sec").eq("user_id", userId),
    ]);
    const err = at.error ?? ri.error ?? bm.error ?? pr.error ?? da.error ?? mt.error;
    if (err) { log("export", err); return UNAVAILABLE; }
    return { ok: true, json: JSON.stringify({ exportedAt: new Date().toISOString(), attempts: at.data, revision: ri.data, bookmarks: bm.data, preferences: pr.data, dailySets: da.data, miniTests: mt.data }, null, 2) };
  });

// ---------------- Mini-tests ----------------
async function testView(userId: string, testId: string | null): Promise<MiniTestView | null> {
  if (!testId) return null;
  const { miniTestDeps, fetchPracticeView } = await import("@/server/learning/admin.server");
  const t = await miniTestDeps(userId).load(testId);
  if (!t) return null;
  const items = await Promise.all([...t.items].sort((a, b) => a.position - b.position).map(async (i) => {
    const v = await fetchPracticeView(i.questionId).catch(() => null);
    const d = responseSchema.safeParse(i.draft);
    return { position: i.position, question: v, stale: !v || v.revision !== i.revision, draft: d.success ? d.data : null };
  }));
  return { id: t.id, status: t.status, startedAt: t.startedAt, deadlineAt: t.deadlineAt, serverNow: new Date().toISOString(), durationSec: t.durationSec, items, result: (t.result as MiniTestResult | null) ?? null };
}

export const getMiniTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => boundOnly.parse(d))
  .handler(async ({ data, context }): Promise<R<{ test: MiniTestView | null; pool: { questionId: string; topicId: string | null }[]; topics: TopicNode[] }>> => {
    if (!accountMatches(data.expectedUserId, context.userId)) return MISMATCH;
    if (!process.env["SUPABASE_SERVICE_ROLE_KEY"]) return { ok: false, error: "setup_pending" };
    try {
      const { activeTestId, eligiblePool } = await import("@/server/learning/admin.server");
      const [id, pool, topics] = await Promise.all([activeTestId(context.userId), eligiblePool(), loadTopics(context.supabase)]);
      return { ok: true, test: await testView(context.userId, id), pool: pool.map((p) => ({ questionId: p.question_id, topicId: p.topic_id })), topics: [...topics.values()] };
    } catch (e) { log("minitest", e); return UNAVAILABLE; }
  });

export const startMiniTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => startTestInput.parse(d))
  .handler(async ({ data, context }): Promise<R<{ test: MiniTestView | null }>> => {
    if (!accountMatches(data.expectedUserId, context.userId)) return MISMATCH;
    try {
      const { eligiblePool, createMiniTest } = await import("@/server/learning/admin.server");
      const topics = await loadTopics(context.supabase);
      const under = (id: string | null) => { for (let c = id ? topics.get(id) : undefined, i = 0; c && i < 20; c = c.parentId ? topics.get(c.parentId) : undefined, i++) if (c.id === data.topicId) return true; return false; };
      const pool = (await eligiblePool()).filter((p) => !data.topicId || under(p.topic_id));
      // Shuffle on the server; the browser never chooses which questions or revisions are bound.
      const ids = pool.map((p) => p.question_id).map((id) => ({ id, r: crypto.getRandomValues(new Uint32Array(1))[0] })).sort((a, b) => (a.r ?? 0) - (b.r ?? 0)).slice(0, data.count).map((x) => x.id);
      const id = await createMiniTest(context.userId, ids, data.topicId, data.minutes);
      return { ok: true, test: await testView(context.userId, id) };
    } catch (e) { log("start", e); return UNAVAILABLE; }
  });

export const saveMiniDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => draftInput.parse(d))
  .handler(async ({ data, context }): Promise<R<{ outcome: string }>> => {
    if (!accountMatches(data.expectedUserId, context.userId)) return MISMATCH;
    try {
      const { miniTestDeps } = await import("@/server/learning/admin.server");
      const { saveDraft } = await import("@/server/learning/minitest.server");
      return { ok: true, outcome: await saveDraft(miniTestDeps(context.userId), data.testId, data.questionId, data.response) };
    } catch (e) { log("draft", e); return UNAVAILABLE; }
  });

export const finalizeMiniTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => testIdInput.parse(d))
  .handler(async ({ data, context }): Promise<R<{ test: MiniTestView | null; retry: boolean }>> => {
    if (!accountMatches(data.expectedUserId, context.userId)) return MISMATCH;
    try {
      const { miniTestDeps } = await import("@/server/learning/admin.server");
      const { finalize } = await import("@/server/learning/minitest.server");
      const r = await finalize(miniTestDeps(context.userId), data.testId);
      return { ok: true, retry: !r.ok && r.error === "retry", test: await testView(context.userId, data.testId) };
    } catch (e) { log("finalize", e); return UNAVAILABLE; }
  });

