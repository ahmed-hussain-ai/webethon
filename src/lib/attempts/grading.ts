import "server-only";
import { db } from "@/lib/db";
import { markObjective, type Snapshot } from "./marking";

export { markObjective, type Snapshot };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Auto-mark a finished attempt. Idempotent and race-safe (only the first caller writes).
 * Creates empty answer rows for skipped questions so analytics can count them.
 */
export async function gradeAttempt(attemptId: string) {
  const a = await db.attempt.findUnique({
    where: { id: attemptId },
    select: {
      status: true, autoGradedAt: true,
      exam: { select: { multiSelectRule: true } },
      questions: { select: { id: true, marks: true, negativeMarks: true, snapshot: true } },
    },
  });
  if (!a || a.status === "IN_PROGRESS" || a.autoGradedAt) return;

  await db.$transaction(async (tx) => {
    await tx.answer.createMany({
      data: a.questions.map((q) => ({ attemptId, attemptQuestionId: q.id })),
      skipDuplicates: true,
    });
    const answers = await tx.answer.findMany({ where: { attemptId }, select: { id: true, attemptQuestionId: true, selectedOptionIds: true, textAnswer: true } });
    const byQ = new Map(answers.map((x) => [x.attemptQuestionId, x]));
    let total = 0;
    for (const q of a.questions) {
      const ans = byQ.get(q.id)!;
      const m = markObjective(q.snapshot as Snapshot, (ans.selectedOptionIds as string[]) ?? [], Number(q.marks), Number(q.negativeMarks), a.exam.multiSelectRule);
      if (m === null) {
        // Blank written answer: 0 automatically, nothing for the examiner to mark.
        if (!ans.textAnswer?.trim()) await tx.answer.update({ where: { id: ans.id }, data: { autoMarks: 0 } });
        continue;
      }
      total += m;
      await tx.answer.update({ where: { id: ans.id }, data: { autoMarks: m } });
    }
    // Only the first concurrent grader commits.
    const res = await tx.attempt.updateMany({
      where: { id: attemptId, autoGradedAt: null },
      data: { objectiveScore: r2(total), autoGradedAt: new Date() },
    });
    if (res.count === 0) throw new Error("ALREADY_GRADED");
    await recomputeTotals(attemptId, tx);
  }).catch((e) => {
    if (!(e instanceof Error && e.message === "ALREADY_GRADED")) throw e;
  });
}

type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];

/**
 * Final mark per answer = manual ?? auto. Written answers without either are "pending".
 * Total = sum of final marks, never below 0 (negative marking can't make a total negative).
 */
export async function recomputeTotals(attemptId: string, tx: Tx | typeof db = db) {
  const rows = await tx.answer.findMany({
    where: { attemptId },
    select: { autoMarks: true, manualMarks: true },
  });
  let total = 0, pending = 0;
  for (const r of rows) {
    const f = r.manualMarks ?? r.autoMarks;
    if (f === null) pending++;
    else total += Number(f);
  }
  await tx.attempt.update({ where: { id: attemptId }, data: { totalScore: r2(Math.max(0, total)), pendingCount: pending } });
}
