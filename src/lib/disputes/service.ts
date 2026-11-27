import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import { loadOwnedExam } from "@/lib/exams/service";
import { recomputeTotals, type Snapshot } from "@/lib/attempts/grading";

export const CATEGORY_LABEL = {
  GRADING_ERROR: "Marking error", AMBIGUOUS_QUESTION: "Ambiguous or incorrect question",
  TECHNICAL_ISSUE: "Technical problem during the exam", OTHER: "Other",
} as const;
const MAX_PER_ATTEMPT = 5;

export const raiseSchema = z.object({
  attemptQuestionId: z.uuid().nullable().optional(),
  category: z.enum(["GRADING_ERROR", "AMBIGUOUS_QUESTION", "TECHNICAL_ISSUE", "OTHER"], { error: "Choose a reason" }),
  description: z.string({ error: "Explain the problem" }).trim().min(10, "Explain the problem in at least 10 characters").max(2000, "At most 2000 characters"),
});

export const resolveSchema = z.discriminatedUnion("decision", [
  z.object({ decision: z.literal("UNDER_REVIEW") }),
  z.object({ decision: z.literal("REJECT"), note: z.string().trim().min(5, "Explain why (at least 5 characters)").max(2000) }),
  z.object({
    decision: z.literal("ACCEPT"),
    note: z.string().trim().min(5, "Explain the correction (at least 5 characters)").max(2000),
    marks: z.number().min(0, "Marks can't be negative").nullable().optional(), // new mark for the disputed question
    applyToAll: z.boolean().default(false), // same correction for every candidate (ambiguous questions)
  }),
]);

const n = (d: Prisma.Decimal | null | undefined) => (d === null || d === undefined ? null : Number(d));
const NOT_FOUND = () => new ApiError(404, "NOT_FOUND", "Not found");
const audit = (tx: Prisma.TransactionClient, actorId: string, action: string, entityType: string, entityId: string, details: object) =>
  tx.auditLog.create({ data: { actorId, action, entityType, entityId, details } });

/** Window during which candidates may dispute: results publication + exam.dispute_window_hours. */
function windowOf(exam: { resultsStatus: string; resultsPublishedAt: Date | null; disputeWindowHours: number }) {
  if (exam.resultsStatus !== "PUBLISHED" || !exam.resultsPublishedAt) return null;
  return new Date(exam.resultsPublishedAt.getTime() + exam.disputeWindowHours * 3600_000);
}

// ───────────── Candidate ─────────────

export async function raiseDispute(user: CurrentUser, attemptId: string, input: z.output<typeof raiseSchema>) {
  const a = await db.attempt.findUnique({
    where: { id: attemptId },
    select: { userId: true, isSandbox: true, exam: { select: { resultsStatus: true, resultsPublishedAt: true, disputeWindowHours: true } } },
  });
  if (!a || a.userId !== user.id || a.isSandbox) throw NOT_FOUND();
  const until = windowOf(a.exam);
  if (!until) throw new ApiError(409, "DISPUTE_CLOSED", "Disputes open once results are published.");
  if (Date.now() > until.getTime()) throw new ApiError(409, "DISPUTE_CLOSED", "The dispute window for this exam has closed.");
  if (input.attemptQuestionId) {
    const q = await db.attemptQuestion.findFirst({ where: { id: input.attemptQuestionId, attemptId }, select: { id: true } });
    if (!q) throw new ApiError(400, "VALIDATION_FAILED", "That question isn't part of your exam.");
  }
  const count = await db.dispute.count({ where: { attemptId } });
  if (count >= MAX_PER_ATTEMPT) throw new ApiError(409, "DISPUTE_LIMIT", `You can raise at most ${MAX_PER_ATTEMPT} disputes per exam.`);
  try {
    return await db.dispute.create({
      data: { attemptId, attemptQuestionId: input.attemptQuestionId ?? null, raisedById: user.id, category: input.category, description: input.description },
      select: { id: true },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(409, "DISPUTE_EXISTS", "You already have an open dispute about this. Wait for it to be resolved.");
    }
    throw e;
  }
}

export async function myDisputes(user: CurrentUser, attemptId: string) {
  const a = await db.attempt.findUnique({ where: { id: attemptId }, select: { userId: true, exam: { select: { resultsStatus: true, resultsPublishedAt: true, disputeWindowHours: true } } } });
  if (!a || a.userId !== user.id) throw NOT_FOUND();
  const until = windowOf(a.exam);
  const list = await db.dispute.findMany({ where: { attemptId }, orderBy: { createdAt: "desc" } });
  return {
    openUntil: until?.toISOString() ?? null, canRaise: !!until && Date.now() <= until.getTime() && list.length < MAX_PER_ATTEMPT,
    disputes: list.map((d) => ({
      id: d.id, attemptQuestionId: d.attemptQuestionId, category: d.category, description: d.description, status: d.status,
      resolutionNote: d.resolutionNote, marksBefore: n(d.marksBefore), marksAfter: n(d.marksAfter), scoreBefore: n(d.scoreBefore), scoreAfter: n(d.scoreAfter),
      createdAt: d.createdAt.toISOString(), resolvedAt: d.resolvedAt?.toISOString() ?? null,
    })),
  };
}

// ───────────── Examiner ─────────────

export async function examDisputes(actor: CurrentUser, examId: string) {
  await loadOwnedExam(actor, examId);
  const list = await db.dispute.findMany({
    where: { attempt: { examId } },
    orderBy: [{ status: "asc" }, { createdAt: "asc" }],
    include: { attempt: { select: { id: true, totalScore: true, totalMarks: true, user: { select: { name: true, email: true } } } } },
  });
  const aqIds = list.map((d) => d.attemptQuestionId).filter(Boolean) as string[];
  const aqs = await db.attemptQuestion.findMany({
    where: { id: { in: aqIds } },
    select: { id: true, orderIndex: true, marks: true, snapshot: true, answer: { select: { selectedOptionIds: true, textAnswer: true, autoMarks: true, manualMarks: true } } },
  });
  const byId = new Map(aqs.map((q) => [q.id, q]));
  return list.map((d) => {
    const q = d.attemptQuestionId ? byId.get(d.attemptQuestionId) : null;
    const s = q?.snapshot as Snapshot | undefined;
    return {
      id: d.id, status: d.status, category: d.category, description: d.description, createdAt: d.createdAt.toISOString(),
      resolutionNote: d.resolutionNote, resolvedAt: d.resolvedAt?.toISOString() ?? null, appliedToAll: d.appliedToAll,
      marksBefore: n(d.marksBefore), marksAfter: n(d.marksAfter), scoreBefore: n(d.scoreBefore), scoreAfter: n(d.scoreAfter),
      candidate: d.attempt.user, attemptId: d.attempt.id, score: n(d.attempt.totalScore), totalMarks: Number(d.attempt.totalMarks),
      question: q && s ? {
        number: q.orderIndex + 1, type: s.type, text: s.text, marks: Number(q.marks), modelAnswer: s.modelAnswer,
        options: s.options.map((o) => ({ ...o, correct: s.correctOptionIds.includes(o.id), picked: ((q.answer?.selectedOptionIds as string[]) ?? []).includes(o.id) })),
        textAnswer: q.answer?.textAnswer ?? null, current: q.answer ? n(q.answer.manualMarks ?? q.answer.autoMarks) : 0,
      } : null,
    };
  });
}
export type ExamDispute = Awaited<ReturnType<typeof examDisputes>>[number];

/**
 * Resolve a dispute. ACCEPT may set a new mark for the disputed question; with applyToAll, every
 * other candidate's mark on that question is raised to at least the same value (never lowered).
 * All mark changes go through the dispute path (DB allows it only with app.dispute_resolution),
 * totals are recomputed, before/after are recorded and an audit entry is written.
 */
export async function resolveDispute(actor: CurrentUser, examId: string, disputeId: string, input: z.output<typeof resolveSchema>) {
  await loadOwnedExam(actor, examId);
  const d = await db.dispute.findFirst({
    where: { id: disputeId, attempt: { examId } },
    include: { attempt: { select: { id: true, totalScore: true } } },
  });
  if (!d) throw NOT_FOUND();
  if (d.status === "ACCEPTED" || d.status === "REJECTED") throw new ApiError(409, "DISPUTE_RESOLVED", "This dispute is already resolved.");

  if (input.decision === "UNDER_REVIEW") {
    await db.dispute.update({ where: { id: d.id }, data: { status: "UNDER_REVIEW" } });
    return;
  }
  if (input.decision === "REJECT") {
    await db.$transaction(async (tx) => {
      await tx.dispute.update({ where: { id: d.id }, data: { status: "REJECTED", resolutionNote: input.note, resolvedById: actor.id, resolvedAt: new Date(), scoreBefore: d.attempt.totalScore, scoreAfter: d.attempt.totalScore } });
      await audit(tx, actor.id, "DISPUTE_REJECTED", "dispute", d.id, { note: input.note });
    });
    return;
  }

  // ACCEPT
  const newMarks = input.marks ?? null;
  if (newMarks !== null && !d.attemptQuestionId) throw new ApiError(400, "VALIDATION_FAILED", "This dispute is about the whole result; change marks per question from its own dispute or accept without a mark change.");
  if (input.applyToAll && newMarks === null) throw new ApiError(400, "VALIDATION_FAILED", "Enter the corrected mark to apply it to everyone.");
  const aq = d.attemptQuestionId ? await db.attemptQuestion.findUnique({ where: { id: d.attemptQuestionId }, select: { questionId: true, marks: true, answer: { select: { id: true, autoMarks: true, manualMarks: true } } } }) : null;
  if (aq && newMarks !== null && newMarks > Number(aq.marks)) {
    throw new ApiError(400, "VALIDATION_FAILED", "Please fix the highlighted fields", { marks: `Marks must be between 0 and ${aq.marks}` });
  }
  const before = aq?.answer ? n(aq.answer.manualMarks ?? aq.answer.autoMarks) : null;

  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.dispute_resolution', 'on', true)`; // this transaction only
    let applied = 0;
    if (aq && newMarks !== null) {
      if (aq.answer) await tx.answer.update({ where: { id: aq.answer.id }, data: { manualMarks: newMarks, gradedById: actor.id, gradedAt: new Date(), feedback: `Changed after dispute: ${input.note}` } });
      if (input.applyToAll) {
        // Every other submitted attempt on the same question: raise to at least newMarks, never lower.
        const others = await tx.answer.findMany({
          where: { attemptQuestion: { questionId: aq.questionId }, attempt: { examId, isSandbox: false, status: { not: "IN_PROGRESS" }, id: { not: d.attemptId } } },
          select: { id: true, attemptId: true, autoMarks: true, manualMarks: true, attemptQuestion: { select: { marks: true } } },
        });
        for (const o of others) {
          const cur = n(o.manualMarks ?? o.autoMarks) ?? 0;
          const target = Math.min(newMarks, Number(o.attemptQuestion.marks));
          if (cur < target) {
            await tx.answer.update({ where: { id: o.id }, data: { manualMarks: target, gradedById: actor.id, gradedAt: new Date(), feedback: `Corrected for all candidates after a dispute: ${input.note}` } });
            await recomputeTotals(o.attemptId, tx);
            applied++;
          }
        }
      }
      await recomputeTotals(d.attemptId, tx);
    }
    const after = await tx.attempt.findUniqueOrThrow({ where: { id: d.attemptId }, select: { totalScore: true } });
    await tx.dispute.update({
      where: { id: d.id },
      data: {
        status: "ACCEPTED", resolutionNote: input.note, resolvedById: actor.id, resolvedAt: new Date(),
        marksBefore: before, marksAfter: newMarks ?? before, scoreBefore: d.attempt.totalScore, scoreAfter: after.totalScore, appliedToAll: applied,
      },
    });
    await audit(tx, actor.id, "DISPUTE_ACCEPTED", "dispute", d.id, { note: input.note, marksBefore: before, marksAfter: newMarks, applyToAll: input.applyToAll, otherCandidatesCorrected: applied });
  });
}

export async function openDisputeCount(examId: string) {
  return db.dispute.count({ where: { attempt: { examId }, status: { in: ["OPEN", "UNDER_REVIEW"] } } });
}
