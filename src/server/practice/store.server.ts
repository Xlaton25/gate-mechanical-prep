/** Trusted store: service-role RPCs only (execute is revoked from anon/authenticated). */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";
import type { PracticeStore } from "./submit.server";

class StoreError extends Error {
  constructor(public code: string) {
    super("practice store error");
    this.name = "StoreError";
  }
}

export function createAdminPracticeStore(): PracticeStore {
  return {
    async loadContext(questionId) {
      const { data, error } = await supabaseAdmin.rpc("practice_scoring_context", { p_question_id: questionId });
      if (error) throw new StoreError(error.code ?? "rpc");
      return data;
    },
    async record(a) {
      const { data, error } = await supabaseAdmin.rpc("practice_record_attempt", {
        p_user_id: a.userId,
        p_submission_id: a.submissionId,
        p_request_hash: a.requestHash,
        p_question_id: a.questionId,
        p_assignment_id: a.assignmentId as string, // SQL accepts null (standalone attempt)
        p_response: a.response as Json,
        p_status: a.status,
        p_marks_thirds: a.marksThirds,
        p_key_version_id: a.keyVersionId,
        p_policy_id: a.policyId,
        p_context_fingerprint: a.contextFingerprint,
        p_duration_sec: a.durationSec as number,
      });
      if (error) throw new StoreError(error.code ?? "rpc");
      return data;
    },
    async loadSolution(questionId) {
      const { data, error } = await supabaseAdmin.rpc("practice_solution", { p_question_id: questionId });
      if (error) throw new StoreError(error.code ?? "rpc");
      return typeof data === "string" ? data : null;
    },
  };
}
