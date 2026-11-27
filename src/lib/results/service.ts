import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import { loadOwnedExam } from "@/lib/exams/service";
import { finaliseExpired } from "@/lib/candidate/service";
import { recomputeTotals, type Snapshot } from "@/lib/attempts/grading";
import { llmConfigured, llmModel, suggestMarks } from "./llm";
import { examPhase } from "@/lib/exams/status";

const n = (d: Prisma.Decimal | number | null | undefined) => (d === null || d === undefined ? null : Number(d));
const r2 = (x: number) => Math.round(x * 100) / 100;
const pct = (score: number, total: number) => (total > 0 ? r2((score / total) * 100) : 0);

/** Examiner overview of an exam's results + summary statistics (real submission data only). */
export async function getResults(actor: CurrentUser, examId: string) {
  const exam = await loadOwnedExam(actor, examId);
  await finaliseExpired({ examId });
  const [attempts, enrollments] = await Promise.all([
    db.attempt.findMany({
      where: { examId, isSandbox: false },
      orderBy: [{ totalScore: { sort: "desc", nulls: "last" } }, { submittedAt: "asc" }],
      select: {
        id: true, status: true, startedAt: true, submittedAt: true, totalScore: true, objectiveScore: true, pendingCount: true, totalMarks: true,
        user: { select: { id: true, name: true, email: true } },
        _count: { select: { answers: { where: { OR: [{ selectedOptionIds: { not: [] } }, { textAnswer: { not: null } }] } } } },
      },
    }),
    db.enrollment.findMany({ where: { examId, status: "ACTIVE" }, select: { candidate: { select: { id: true, name: true, email: true } } } }),
  ]);
  const total = Number(exam.totalMarks), pass = Number(exam.passMarks);
  const finished = attempts.filter((a) => a.status !== "IN_PROGRESS" && a.totalScore !== null);
  const scores = finished.map((a) => Number(a.totalScore)).sort((x, y) => x - y);
  const attempted = new Set(attempts.map((a) => a.user.id));
  const absent = enrollments.filter((e) => !attempted.has(e.candidate.id)).map((e) => e.candidate);
  const median = scores.length ? (scores.length % 2 ? scores[(scores.length - 1) / 2] : (scores[scores.length / 2 - 1] + scores[scores.length / 2]) / 2) : null;
  const buckets = Array.from({ length: 10 }, (_, i) => ({ from: i * 10, to: i * 10 + 10, count: 0 }));
  for (const s of scores) buckets[Math.min(9, Math.floor(pct(s, total) / 10))].count++;
  const pendingAnswers = attempts.reduce((s, a) => s + a.pendingCount, 0);
  const inProgress = attempts.filter((a) => a.status === "IN_PROGRESS").length;
  const phase = examPhase(exam);

  return {
    exam: {
      id: exam.id, title: exam.title, totalMarks: total, passMarks: pass, phase, autoCheckWritten: exam.autoCheckWritten,
      resultsStatus: exam.resultsStatus, resultsPublishedAt: exam.resultsPublishedAt?.toISOString() ?? null, endAt: exam.endAt?.toISOString() ?? null,
    },
    aiAvailable: llmConfigured(),
    canPublish: exam.resultsStatus === "HIDDEN" && phase === "COMPLETED" && inProgress === 0 && pendingAnswers === 0 && finished.length > 0,
    blockers: [
      phase !== "COMPLETED" && "The exam hasn't ended yet",
      inProgress > 0 && `${inProgress} attempt(s) still in progress`,
      pendingAnswers > 0 && `${pendingAnswers} written answer(s) still need a mark`,
      finished.length === 0 && "No submitted attempts yet",
    ].filter(Boolean) as string[],
    summary: {
      enrolled: enrollments.length + attempts.filter((a) => !enrollments.some((e) => e.candidate.id === a.user.id)).length,
      submitted: finished.length, inProgress, absent: absent.length, pendingAnswers,
      average: scores.length ? r2(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
      median: median === null ? null : r2(median),
      highest: scores.length ? scores[scores.length - 1] : null,
      lowest: scores.length ? scores[0] : null,
      passRate: scores.length ? r2((scores.filter((s) => s >= pass).length / scores.length) * 100) : null,
      distribution: buckets,
    },
    attempts: attempts.map((a) => {
      const score = n(a.totalScore);
      return {
        id: a.id, status: a.status, submittedAt: a.submittedAt?.toISOString() ?? null, candidate: a.user,
        score, percent: score === null ? null : pct(score, total), passed: score === null ? null : score >= pass,
        pending: a.pendingCount, answered: a._count.answers,
      };
    }),
    absent,
  };
}
export type ResultsOverview = Awaited<ReturnType<typeof getResults>>;

/** Per-question insight (PDF 4.5) from real, non-sandbox submissions. */
export async function questionAnalytics(actor: CurrentUser, examId: string) {
  await loadOwnedExam(actor, examId);
  const rows = await db.attemptQuestion.findMany({
    where: { attempt: { examId, isSandbox: false, status: { not: "IN_PROGRESS" } } },
    select: { questionId: true, marks: true, snapshot: true, answer: { select: { selectedOptionIds: true, textAnswer: true, autoMarks: true, manualMarks: true } } },
  });
  const by = new Map<string, typeof rows>();
  for (const r of rows) by.set(r.questionId, [...(by.get(r.questionId) ?? []), r]);
  const examQs = await db.examQuestion.findMany({ where: { examId }, orderBy: { orderIndex: "asc" }, select: { questionId: true } });
  return examQs.map(({ questionId }, i) => {
    const list = by.get(questionId) ?? [];
    const snap = (list[0]?.snapshot ?? null) as Snapshot | null;
    const seen = list.length;
    let skipped = 0, full = 0, sum = 0, max = 0;
    const wrongPicks = new Map<string, number>();
    for (const r of list) {
      const a = r.answer;
      const blank = !a || ((a.selectedOptionIds as string[]).length === 0 && !a.textAnswer?.trim());
      if (blank) skipped++;
      const final = a ? n(a.manualMarks ?? a.autoMarks) : 0;
      const m = Number(r.marks);
      max += m;
      sum += final ?? 0;
      if (final !== null && final >= m) full++;
      if (snap && snap.type !== "WRITTEN" && a) {
        for (const id of a.selectedOptionIds as string[]) if (!snap.correctOptionIds.includes(id)) wrongPicks.set(id, (wrongPicks.get(id) ?? 0) + 1);
      }
    }
    const topWrong = [...wrongPicks.entries()].sort((x, y) => y[1] - x[1])[0];
    const avgRatio = max ? sum / max : null;
    return {
      number: i + 1, questionId, type: snap?.type ?? null, text: snap?.text ?? "(not attempted yet)", labelled: snap?.difficulty ?? null,
      attempts: seen, skippedRate: seen ? r2((skipped / seen) * 100) : null, fullMarksRate: seen ? r2((full / seen) * 100) : null,
      averagePercent: avgRatio === null ? null : r2(avgRatio * 100),
      observed: avgRatio === null ? null : avgRatio >= 0.7 ? "EASY" : avgRatio >= 0.4 ? "MEDIUM" : "HARD",
      commonWrong: topWrong && snap ? { text: snap.options.find((o) => o.id === topWrong[0])?.text ?? "?", count: topWrong[1] } : null,
    };
  });
}

/** One attempt with everything the examiner needs to review and mark it. */
export async function getAttemptForGrading(actor: CurrentUser, examId: string, attemptId: string) {
  const exam = await loadOwnedExam(actor, examId);
  await finaliseExpired({ attemptId });
  const a = await db.attempt.findFirst({
    where: { id: attemptId, examId, isSandbox: false },
    select: {
      id: true, status: true, startedAt: true, submittedAt: true, deadlineAt: true, totalScore: true, pendingCount: true, totalMarks: true,
      user: { select: { name: true, email: true } },
      questions: {
        orderBy: { orderIndex: "asc" },
        select: {
          id: true, orderIndex: true, marks: true, negativeMarks: true, snapshot: true,
          answer: { select: { id: true, selectedOptionIds: true, textAnswer: true, markedForReview: true, autoMarks: true, manualMarks: true, feedback: true, aiMarks: true, aiReason: true, aiModel: true, gradedAt: true } },
        },
      },
    },
  });
  if (!a) throw new ApiError(404, "NOT_FOUND", "Attempt not found");
  return {
    id: a.id, status: a.status, startedAt: a.startedAt.toISOString(), submittedAt: a.submittedAt?.toISOString() ?? null,
    candidate: a.user, score: n(a.totalScore), pending: a.pendingCount, totalMarks: Number(a.totalMarks),
    locked: exam.resultsStatus === "PUBLISHED", multiSelectRule: exam.multiSelectRule,
    questions: a.questions.map((q) => {
      const s = q.snapshot as Snapshot;
      const ans = q.answer;
      const final = ans ? n(ans.manualMarks ?? ans.autoMarks) : null;
      return {
        attemptQuestionId: q.id, number: q.orderIndex + 1, type: s.type, text: s.text, marks: Number(q.marks), negativeMarks: Number(q.negativeMarks),
        options: s.options.map((o) => ({ ...o, correct: s.correctOptionIds.includes(o.id) })), modelAnswer: s.modelAnswer,
        answer: ans && {
          id: ans.id, selectedOptionIds: ans.selectedOptionIds as string[], textAnswer: ans.textAnswer, markedForReview: ans.markedForReview,
          autoMarks: n(ans.autoMarks), manualMarks: n(ans.manualMarks), feedback: ans.feedback, aiMarks: n(ans.aiMarks), aiReason: ans.aiReason, aiModel: ans.aiModel,
        },
        final, needsMark: !!ans && final === null,
      };
    }),
  };
}
export type GradingView = Awaited<ReturnType<typeof getAttemptForGrading>>;

/** Examiner sets (or clears, for objective overrides) a mark, validated against the question's marks. */
export async function setMark(actor: CurrentUser, examId: string, attemptId: string, answerId: string, input: { marks: number | null; feedback: string | null }) {
  const exam = await loadOwnedExam(actor, examId);
  if (exam.resultsStatus === "PUBLISHED") throw new ApiError(409, "GRADING_LOCKED", "Results are published. Marks can now only change through a dispute.");
  const ans = await db.answer.findFirst({
    where: { id: answerId, attemptId, attempt: { examId, isSandbox: false } },
    select: { attempt: { select: { status: true } }, attemptQuestion: { select: { marks: true, snapshot: true } } },
  });
  if (!ans) throw new ApiError(404, "NOT_FOUND", "Answer not found");
  if (ans.attempt.status === "IN_PROGRESS") throw new ApiError(409, "GRADING_LOCKED", "This attempt is still in progress.");
  const max = Number(ans.attemptQuestion.marks);
  if (input.marks !== null && (input.marks < 0 || input.marks > max)) {
    throw new ApiError(400, "VALIDATION_FAILED", "Please fix the highlighted fields", { marks: `Marks must be between 0 and ${max}` });
  }
  await db.$transaction(async (tx) => {
    await tx.answer.update({
      where: { id: answerId },
      data: { manualMarks: input.marks, feedback: input.feedback, gradedById: actor.id, gradedAt: new Date() },
    });
    await recomputeTotals(attemptId, tx);
  });
}

export const FLAG = "[FLAGGED: possible instruction to the marker; mark manually]";
const INJECTION = /\b(ignore|disregard|forget)\b.{0,40}\b(rubric|instruction|rule|prompt|previous)|\b(full|maximum|max|all)\s+marks?\b|\b(system prompt|you are (an?|the) (ai|marker|grader))\b/i;
export const looksLikeInjection = (t: string) => INJECTION.test(t);

/** Accept AI suggestions as final marks where the examiner hasn't marked yet (flagged ones excluded). */
export async function acceptAiSuggestions(actor: CurrentUser, examId: string, attemptId?: string) {
  const exam = await loadOwnedExam(actor, examId);
  if (exam.resultsStatus === "PUBLISHED") throw new ApiError(409, "GRADING_LOCKED", "Results are already published.");
  const rows = await db.answer.findMany({
    where: {
      attempt: { examId, isSandbox: false, status: { not: "IN_PROGRESS" }, ...(attemptId ? { id: attemptId } : {}) },
      manualMarks: null, aiMarks: { not: null }, NOT: { aiReason: { startsWith: "[FLAGGED" } },
    },
    select: { id: true, attemptId: true, aiMarks: true },
  });
  const touched = new Set<string>();
  for (const r of rows) {
    await db.answer.update({ where: { id: r.id }, data: { manualMarks: r.aiMarks, gradedById: actor.id, gradedAt: new Date() } });
    touched.add(r.attemptId);
  }
  for (const id of touched) await recomputeTotals(id);
  return { accepted: rows.length };
}

/**
 * Ask the AI for a suggested mark on every unmarked written answer of the exam (or one attempt).
 * Identical answers to the same question reuse the earlier result (consistency, fewer calls).
 * Failures leave the answer for manual marking; nothing becomes final without the examiner.
 */
export async function runAiCheck(actor: CurrentUser, examId: string, attemptId?: string) {
  const exam = await loadOwnedExam(actor, examId);
  if (!exam.autoCheckWritten) throw new ApiError(409, "AI_DISABLED", "AI checking is switched off for this exam. Mark written answers manually.");
  if (!llmConfigured()) throw new ApiError(409, "AI_NOT_CONFIGURED", "AI checking isn't set up on this server (no LLM_API_KEY). Mark written answers manually.");
  if (exam.resultsStatus === "PUBLISHED") throw new ApiError(409, "GRADING_LOCKED", "Results are already published.");
  await finaliseExpired({ examId });
  const todo = await db.answer.findMany({
    where: {
      attempt: { examId, isSandbox: false, status: { not: "IN_PROGRESS" }, ...(attemptId ? { id: attemptId } : {}) },
      manualMarks: null, aiMarks: null, autoMarks: null, textAnswer: { not: null },
    },
    select: { id: true, textAnswer: true, attemptQuestion: { select: { questionId: true, marks: true, snapshot: true } } },
    take: 200,
  });
  const cache = new Map<string, { marks: number; reason: string; model: string }>();
  // Reuse results already stored for identical answers to the same question.
  const prior = await db.answer.findMany({
    where: { attempt: { examId }, aiMarks: { not: null }, textAnswer: { not: null } },
    select: { textAnswer: true, aiMarks: true, aiReason: true, aiModel: true, attemptQuestion: { select: { questionId: true } } },
  });
  const key = (qid: string, t: string) => `${qid}::${t.trim().replace(/\s+/g, " ").toLowerCase()}`;
  for (const p of prior) cache.set(key(p.attemptQuestion.questionId, p.textAnswer!), { marks: Number(p.aiMarks), reason: p.aiReason ?? "", model: p.aiModel ?? llmModel() });

  let done = 0, failed = 0;
  const queue = [...todo];
  async function worker() {
    for (let item = queue.shift(); item; item = queue.shift()) {
      const s = item.attemptQuestion.snapshot as Snapshot;
      const k = key(item.attemptQuestion.questionId, item.textAnswer!);
      try {
        const r = cache.get(k) ?? (await suggestMarks({ question: s.text, maxMarks: Number(item.attemptQuestion.marks), correctAnswer: s.modelAnswer ?? "", candidateAnswer: item.textAnswer! }));
        cache.set(k, r);
        // Text that talks to the marker ("ignore the rubric", "give full marks"…) is flagged:
        // the suggestion is kept for reference but must be marked by hand.
        const reason = looksLikeInjection(item.textAnswer!) ? `${FLAG} ${r.reason}` : r.reason;
        await db.answer.update({ where: { id: item.id }, data: { aiMarks: r.marks, aiReason: reason, aiModel: r.model, aiAt: new Date() } });
        done++;
      } catch {
        failed++;
      }
    }
  }
  await Promise.all([worker(), worker(), worker()]);
  return { checked: done, failed, remaining: Math.max(0, todo.length - done - failed) };
}

export async function publishResults(actor: CurrentUser, examId: string) {
  const r = await getResults(actor, examId);
  if (r.exam.resultsStatus === "PUBLISHED") throw new ApiError(409, "ALREADY_PUBLISHED", "Results are already published.");
  if (!r.canPublish) throw new ApiError(409, "RESULTS_BLOCKED", `Can't publish yet: ${r.blockers.join("; ")}.`);
  await db.exam.update({ where: { id: examId }, data: { resultsStatus: "PUBLISHED", resultsPublishedAt: new Date() } });
}

/** Candidate's own published result (404 until published; never another candidate's). */
export async function getMyResult(user: CurrentUser, attemptId: string) {
  const a = await db.attempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true, userId: true, isSandbox: true, status: true, submittedAt: true, totalScore: true, totalMarks: true,
      exam: { select: { id: true, title: true, passMarks: true, resultsStatus: true, resultsPublishedAt: true, disputeWindowHours: true } },
      questions: {
        orderBy: { orderIndex: "asc" },
        select: { id: true, orderIndex: true, marks: true, snapshot: true, answer: { select: { selectedOptionIds: true, textAnswer: true, autoMarks: true, manualMarks: true, feedback: true } } },
      },
    },
  });
  if (!a || a.userId !== user.id || a.isSandbox || a.exam.resultsStatus !== "PUBLISHED") throw new ApiError(404, "NOT_FOUND", "Result not found");
  const score = Number(a.totalScore ?? 0), total = Number(a.totalMarks);
  const disputeUntil = a.exam.resultsPublishedAt ? new Date(a.exam.resultsPublishedAt.getTime() + a.exam.disputeWindowHours * 3600_000) : null;
  return {
    attemptId: a.id, exam: { id: a.exam.id, title: a.exam.title }, submittedAt: a.submittedAt?.toISOString() ?? null,
    score, total, percent: pct(score, total), passMarks: Number(a.exam.passMarks), passed: score >= Number(a.exam.passMarks),
    publishedAt: a.exam.resultsPublishedAt?.toISOString() ?? null, disputeUntil: disputeUntil?.toISOString() ?? null,
    questions: a.questions.map((q) => {
      const s = q.snapshot as Snapshot;
      const ans = q.answer;
      return {
        attemptQuestionId: q.id, number: q.orderIndex + 1, type: s.type, text: s.text, marks: Number(q.marks),
        options: s.options.map((o) => ({ ...o, correct: s.correctOptionIds.includes(o.id) })), modelAnswer: s.modelAnswer,
        selected: (ans?.selectedOptionIds as string[]) ?? [], textAnswer: ans?.textAnswer ?? null,
        awarded: ans ? n(ans.manualMarks ?? ans.autoMarks) ?? 0 : 0, feedback: ans?.feedback ?? null,
      };
    }),
  };
}
export type MyResult = Awaited<ReturnType<typeof getMyResult>>;
