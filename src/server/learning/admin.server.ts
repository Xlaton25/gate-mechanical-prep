/** Trusted learning operations: service-role RPCs/tables only, always scoped to the VERIFIED user id. */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import { createAdminPracticeStore, fetchPracticeView } from "@/server/practice/store.server";
import { submitAttempt } from "@/server/practice/submit.server";
import type { MiniTestDeps, MiniTestRow } from "./minitest.server";

const fail = (e: { code?: string } | null) => {
  if (e) throw Object.assign(new Error("learning store error"), { code: e.code ?? "rpc" });
};

export async function ensureDaily(userId: string): Promise<string> {
  const { data, error } = await supabaseAdmin.rpc("ensure_daily_assignment", { p_user_id: userId });
  fail(error);
  return data as string;
}

export async function eligiblePool(): Promise<{ question_id: string; topic_id: string | null }[]> {
  const { data, error } = await supabaseAdmin.rpc("practice_eligible_questions");
  fail(error);
  return (data ?? []) as { question_id: string; topic_id: string | null }[];
}

export async function markRevision(userId: string, questionId: string) {
  const { error } = await supabaseAdmin.rpc("mark_for_revision", { p_user_id: userId, p_question_id: questionId });
  fail(error);
}

export { fetchPracticeView };

export async function createMiniTest(userId: string, questionIds: string[], topicId: string | null, minutes: number): Promise<string | null> {
  const views = await Promise.all(questionIds.map((id) => fetchPracticeView(id)));
  const items = views.flatMap((v, i) => (v ? [{ questionId: questionIds[i], revision: v.revision }] : []));
  if (items.length === 0) return null;
  const now = Date.now();
  const { data: t, error } = await supabaseAdmin
    .from("mini_tests")
    .insert({ user_id: userId, topic_id: topicId, duration_sec: minutes * 60, started_at: new Date(now).toISOString(), deadline_at: new Date(now + minutes * 60_000).toISOString() })
    .select("id")
    .single();
  if (error?.code === "23505") return activeTestId(userId); // one active test per user: reuse it
  fail(error);
  const { error: e2 } = await supabaseAdmin.from("mini_test_items").insert(
    items.map((it, i) => ({ test_id: t!.id, user_id: userId, position: i + 1, question_id: it.questionId, revision: it.revision })),
  );
  if (e2) {
    await supabaseAdmin.from("mini_tests").delete().eq("id", t!.id).eq("user_id", userId);
    fail(e2);
  }
  return t!.id;
}

export async function activeTestId(userId: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin.from("mini_tests").select("id").eq("user_id", userId).eq("status", "active").maybeSingle();
  fail(error);
  return data?.id ?? null;
}

export function miniTestDeps(userId: string): MiniTestDeps {
  const store = createAdminPracticeStore();
  return {
    now: () => Date.now(),
    async load(testId) {
      const { data, error } = await supabaseAdmin
        .from("mini_tests")
        .select("id, status, started_at, deadline_at, duration_sec, result, mini_test_items(position, question_id, revision, submission_id, draft)")
        .eq("id", testId).eq("user_id", userId).maybeSingle();
      fail(error);
      if (!data) return null;
      return {
        id: data.id, status: data.status as MiniTestRow["status"], startedAt: data.started_at, deadlineAt: data.deadline_at,
        durationSec: data.duration_sec, result: data.result,
        items: (data.mini_test_items ?? []).map((i) => ({ position: i.position, questionId: i.question_id, revision: i.revision, submissionId: i.submission_id, draft: i.draft })),
      };
    },
    async writeDraft(testId, questionId, draft) {
      const { error } = await supabaseAdmin.from("mini_test_items").update({ draft: draft as Json })
        .eq("test_id", testId).eq("user_id", userId).eq("question_id", questionId);
      fail(error);
    },
    async writeResult(testId, result) {
      const { data, error } = await supabaseAdmin.from("mini_tests")
        .update({ status: "finalized", finalized_at: new Date().toISOString(), result: result as unknown as Json })
        .eq("id", testId).eq("user_id", userId).eq("status", "active").select("id");
      fail(error);
      return (data ?? []).length > 0;
    },
    submit: (input) => submitAttempt(store, userId, input),
  };
}
