import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import { finaliseExpired } from "@/lib/candidate/service";
import { gradeAttempt, type Snapshot } from "./grading";

/** Saves that reach the server up to this long after the deadline still count (network transit). */
export const GRACE_MS = 2000;
export const MAX_TEXT = 20000;

export const answerBatchSchema = z.object({
  answers: z
    .array(
      z.object({
        attemptQuestionId: z.uuid(),
        selectedOptionIds: z.array(z.uuid()).max(10).default([]),
        textAnswer: z.string().max(MAX_TEXT, `Answer is too long (max ${MAX_TEXT} characters)`).nullable().optional(),
        markedForReview: z.boolean().default(false),
        seq: z.number().int().min(1).max(2_000_000_000),
      }),
    )
    .max(200),
});
export type AnswerBatch = z.output<typeof answerBatchSchema>;

async function ownAttempt(user: CurrentUser, attemptId: string) {
  const a = await db.attempt.findUnique({
    where: { id: attemptId },
    select: { id: true, userId: true, isSandbox: true, status: true, deadlineAt: true, examId: true },
  });
  if (!a || a.userId !== user.id || a.isSandbox) throw new ApiError(404, "NOT_FOUND", "Attempt not found");
  return a;
}

/** The candidate's frozen paper + their saved answers. Never includes correct answers. */
export async function getPaper(user: CurrentUser, attemptId: string) {
  await ownAttempt(user, attemptId);
  await finaliseExpired({ attemptId });
  const a = await db.attempt.findUniqueOrThrow({
    where: { id: attemptId },
    select: {
      id: true, status: true, startedAt: true, deadlineAt: true, submittedAt: true, totalMarks: true,
      exam: { select: { id: true, title: true, instructions: true, multiSelectRule: true } },
      questions: { orderBy: { orderIndex: "asc" }, select: { id: true, orderIndex: true, marks: true, negativeMarks: true, snapshot: true } },
      answers: { select: { attemptQuestionId: true, selectedOptionIds: true, textAnswer: true, markedForReview: true, clientSeq: true, savedAt: true } },
    },
  });
  const byQ = new Map(a.answers.map((x) => [x.attemptQuestionId, x]));
  return {
    id: a.id, status: a.status, startedAt: a.startedAt.toISOString(), deadlineAt: a.deadlineAt.toISOString(),
    submittedAt: a.submittedAt?.toISOString() ?? null, totalMarks: Number(a.totalMarks),
    exam: { id: a.exam.id, title: a.exam.title, instructions: a.exam.instructions, multiSelectRule: a.exam.multiSelectRule },
    serverNow: new Date().toISOString(),
    questions: a.questions.map((q) => {
      const s = q.snapshot as Snapshot;
      const ans = byQ.get(q.id);
      return {
        id: q.id, number: q.orderIndex + 1, type: s.type, text: s.text,
        options: s.options, // already in this candidate's (possibly shuffled) order; no correct flags
        marks: Number(q.marks), negativeMarks: Number(q.negativeMarks),
        answer: ans
          ? { selectedOptionIds: ans.selectedOptionIds as string[], textAnswer: ans.textAnswer, markedForReview: ans.markedForReview, seq: ans.clientSeq }
          : null,
      };
    }),
  };
}
export type Paper = Awaited<ReturnType<typeof getPaper>>;

/**
 * Autosave a batch of answers. For each question only the change with the highest `seq`
 * wins, so a slow, older request can never overwrite a newer one. Accepted only while the
 * attempt is running and within the deadline (+ GRACE_MS for network transit).
 */
export async function saveAnswers(user: CurrentUser, attemptId: string, batch: AnswerBatch) {
  const a = await ownAttempt(user, attemptId);
  const now = Date.now();
  if (a.status !== "IN_PROGRESS" || now > a.deadlineAt.getTime() + GRACE_MS) {
    await finaliseExpired({ attemptId });
    throw new ApiError(409, "TIME_UP", "Time is up. Your exam has been submitted with the answers saved before the deadline.");
  }
  if (!batch.answers.length) return { saved: [], serverNow: new Date().toISOString(), deadlineAt: a.deadlineAt.toISOString() };

  // Validate every answer against this candidate's frozen paper.
  const qs = await db.attemptQuestion.findMany({
    where: { attemptId, id: { in: batch.answers.map((x) => x.attemptQuestionId) } },
    select: { id: true, snapshot: true },
  });
  const byId = new Map(qs.map((q) => [q.id, q.snapshot as Snapshot]));
  // Keep only the newest change per question within the batch.
  const latest = new Map<string, AnswerBatch["answers"][number]>();
  for (const x of batch.answers) if (!latest.has(x.attemptQuestionId) || latest.get(x.attemptQuestionId)!.seq < x.seq) latest.set(x.attemptQuestionId, x);

  for (const x of latest.values()) {
    const snap = byId.get(x.attemptQuestionId);
    if (!snap) throw new ApiError(400, "INVALID_ANSWER", "That question is not part of your exam.");
    const valid = new Set(snap.options.map((o) => o.id));
    const sel = [...new Set(x.selectedOptionIds)];
    if (sel.some((id) => !valid.has(id))) throw new ApiError(400, "INVALID_ANSWER", "Invalid option for this question.");
    if (snap.type === "SINGLE_CHOICE" && sel.length > 1) throw new ApiError(400, "INVALID_ANSWER", "Only one option can be selected for this question.");
    if (snap.type === "WRITTEN" && sel.length) throw new ApiError(400, "INVALID_ANSWER", "Written questions take a text answer.");
    if (snap.type !== "WRITTEN" && x.textAnswer) throw new ApiError(400, "INVALID_ANSWER", "This question takes options, not text.");
    x.selectedOptionIds = sel;
  }

  const saved: { attemptQuestionId: string; seq: number }[] = [];
  await db.$transaction(async (tx) => {
    for (const x of latest.values()) {
      const text = x.textAnswer ?? null;
      // Upsert that only applies when the incoming seq is newer than what is stored.
      const rows = await tx.$queryRaw<{ client_seq: number }[]>`
        INSERT INTO answers (id, attempt_id, attempt_question_id, selected_option_ids, text_answer, marked_for_review, client_seq, saved_at)
        VALUES (gen_random_uuid(), ${attemptId}::uuid, ${x.attemptQuestionId}::uuid, ${JSON.stringify(x.selectedOptionIds)}::jsonb, ${text}, ${x.markedForReview}, ${x.seq}, now())
        ON CONFLICT (attempt_question_id) DO UPDATE
          SET selected_option_ids = EXCLUDED.selected_option_ids, text_answer = EXCLUDED.text_answer,
              marked_for_review = EXCLUDED.marked_for_review, client_seq = EXCLUDED.client_seq, saved_at = now()
          WHERE answers.client_seq < EXCLUDED.client_seq
        RETURNING client_seq`;
      // Either it was applied, or the server already has this or a newer version: both are "saved".
      saved.push({ attemptQuestionId: x.attemptQuestionId, seq: rows[0]?.client_seq ?? x.seq });
    }
    await tx.attempt.update({ where: { id: attemptId }, data: { lastSeenAt: new Date() } });
  });
  return { saved, serverNow: new Date().toISOString(), deadlineAt: a.deadlineAt.toISOString() };
}

/**
 * Submit. Flushes a final batch first (if still in time), then closes the attempt exactly once.
 * Repeated calls (double click, retry after a dropped response) just return the final state.
 */
export async function submitAttempt(user: CurrentUser, attemptId: string, batch: AnswerBatch) {
  const a = await ownAttempt(user, attemptId);
  if (a.status === "IN_PROGRESS" && Date.now() <= a.deadlineAt.getTime() + GRACE_MS && batch.answers.length) {
    await saveAnswers(user, attemptId, batch);
  }
  await finaliseExpired({ attemptId }); // past the deadline → AUTO_SUBMITTED at the deadline
  await db.attempt.updateMany({
    where: { id: attemptId, status: "IN_PROGRESS" },
    data: { status: "SUBMITTED", submittedAt: new Date() },
  });
  await gradeAttempt(attemptId);
  const done = await db.attempt.findUniqueOrThrow({ where: { id: attemptId }, select: { status: true, submittedAt: true, examId: true } });
  return { status: done.status, submittedAt: done.submittedAt!.toISOString(), examId: done.examId };
}
