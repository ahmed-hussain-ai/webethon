import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import { examPhase, readiness } from "./status";
import type { z } from "zod";
import type { examDetailsSchema, examQuestionsSchema, randomPickSchema } from "@/lib/validation/exams";

type Details = z.output<typeof examDetailsSchema>;

const NOT_FOUND = () => new ApiError(404, "NOT_FOUND", "Exam not found");
const n = (d: Prisma.Decimal | number) => Number(d);

/**
 * Exams belong to their creator. Other examiners get 404 (not 403) so they can't even
 * learn an exam exists. Admins can manage every exam.
 */
export async function loadOwnedExam(actor: CurrentUser, id: string) {
  const exam = await db.exam.findUnique({ where: { id } });
  if (!exam) throw NOT_FOUND();
  if (actor.role !== "ADMIN" && exam.createdById !== actor.id) throw NOT_FOUND();
  return exam;
}

export async function listExams(actor: CurrentUser) {
  const exams = await db.exam.findMany({
    where: actor.role === "ADMIN" ? {} : { createdById: actor.id },
    orderBy: [{ updatedAt: "desc" }],
    select: {
      id: true, title: true, status: true, startAt: true, endAt: true, durationMinutes: true, totalMarks: true,
      createdBy: { select: { name: true } },
      _count: { select: { questions: true, enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  return exams.map((e) => ({
    id: e.id, title: e.title, status: e.status, phase: examPhase(e),
    startAt: e.startAt?.toISOString() ?? null, endAt: e.endAt?.toISOString() ?? null,
    durationMinutes: e.durationMinutes, totalMarks: n(e.totalMarks),
    questionCount: e._count.questions, enrolledCount: e._count.enrollments, ownerName: e.createdBy.name,
  }));
}

export async function createExam(actor: CurrentUser, title: string) {
  return db.exam.create({
    data: { title, createdById: actor.id, durationMinutes: 60, totalMarks: 100, passMarks: 50 },
    select: { id: true },
  });
}

/** Full exam for the builder: details, questions with bank info, counts and readiness. */
export async function getExam(actor: CurrentUser, id: string) {
  await loadOwnedExam(actor, id);
  const e = await db.exam.findUniqueOrThrow({
    where: { id },
    include: {
      createdBy: { select: { name: true } },
      questions: {
        orderBy: [{ orderIndex: "asc" }, { id: "asc" }],
        include: {
          question: {
            select: {
              id: true, type: true, text: true, difficulty: true, defaultMarks: true, isActive: true,
              category: { select: { id: true, name: true } }, _count: { select: { options: true } },
            },
          },
        },
      },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } } } },
    },
  });
  const questions = e.questions.map((eq) => ({
    questionId: eq.questionId, marks: n(eq.marks), negativeMarks: n(eq.negativeMarks),
    type: eq.question.type, text: eq.question.text, difficulty: eq.question.difficulty,
    defaultMarks: n(eq.question.defaultMarks), isActive: eq.question.isActive,
    category: eq.question.category, optionCount: eq.question._count.options,
  }));
  const assignedMarks = questions.reduce((s, q) => s + q.marks, 0);
  const phase = examPhase(e);
  return {
    id: e.id, title: e.title, description: e.description, instructions: e.instructions,
    startAt: e.startAt?.toISOString() ?? null, endAt: e.endAt?.toISOString() ?? null,
    durationMinutes: e.durationMinutes, totalMarks: n(e.totalMarks), passMarks: n(e.passMarks),
    shuffleQuestions: e.shuffleQuestions, shuffleOptions: e.shuffleOptions,
    multiSelectRule: e.multiSelectRule, autoCheckWritten: e.autoCheckWritten,
    requireFullscreen: !!(e.settings as { requireFullscreen?: boolean })?.requireFullscreen,
    status: e.status, phase, publishedAt: e.publishedAt?.toISOString() ?? null,
    updatedAt: e.updatedAt.toISOString(), ownerName: e.createdBy.name,
    questions, assignedMarks: Math.round(assignedMarks * 100) / 100,
    activeEnrollments: e._count.enrollments,
    // What may change right now (the DB enforces the same rules).
    canEditQuestions: e.status === "DRAFT",
    canEditSettings: phase === "DRAFT" || phase === "SCHEDULED",
    canUnpublish: phase === "SCHEDULED",
    canDelete: e.status === "DRAFT",
    checks: readiness({
      title: e.title, startAt: e.startAt, endAt: e.endAt, durationMinutes: e.durationMinutes,
      totalMarks: n(e.totalMarks), passMarks: n(e.passMarks), questionCount: questions.length,
      assignedMarks, inactiveCount: questions.filter((q) => !q.isActive).length, activeEnrollments: e._count.enrollments,
    }),
  };
}
export type ExamDetail = Awaited<ReturnType<typeof getExam>>;

const CONFLICT = () =>
  new ApiError(409, "EDIT_CONFLICT", "This exam was changed in another tab or by someone else. Reload to see the latest version.");

export async function updateExamDetails(actor: CurrentUser, id: string, input: Details & { updatedAt: string }) {
  const exam = await loadOwnedExam(actor, id);
  const phase = examPhase(exam);
  if (phase === "COMPLETED") throw new ApiError(409, "EXAM_LOCKED", "This exam has ended; its settings can no longer change.");
  if (exam.status === "PUBLISHED") {
    if (!input.startAt || !input.endAt) {
      throw new ApiError(400, "VALIDATION_FAILED", "Please fix the highlighted fields", { startAt: "A published exam must keep its start and end time" });
    }
    if (input.endAt <= new Date()) {
      throw new ApiError(400, "VALIDATION_FAILED", "Please fix the highlighted fields", { endAt: "End time must be in the future" });
    }
  }
  if (phase === "ONGOING") {
    // Once open, only the texts and an end-time EXTENSION may change (the DB enforces this too).
    const same =
      input.startAt?.getTime() === exam.startAt?.getTime() && input.durationMinutes === exam.durationMinutes &&
      input.totalMarks === n(exam.totalMarks) && input.passMarks === n(exam.passMarks) &&
      input.multiSelectRule === exam.multiSelectRule && input.autoCheckWritten === exam.autoCheckWritten &&
      input.shuffleQuestions === exam.shuffleQuestions && input.shuffleOptions === exam.shuffleOptions &&
      input.requireFullscreen === !!(exam.settings as { requireFullscreen?: boolean })?.requireFullscreen;
    if (!same || !input.endAt || input.endAt < exam.endAt!) {
      throw new ApiError(409, "EXAM_LOCKED", "The exam is in progress: only the title, texts and extending the end time can change.");
    }
  }
  const { updatedAt, requireFullscreen, ...data } = input;
  const settings = { ...((exam.settings as object) ?? {}), requireFullscreen };
  const res = await db.exam.updateMany({ where: { id, updatedAt: new Date(updatedAt) }, data: { ...data, settings, updatedAt: new Date() } });
  if (res.count === 0) throw CONFLICT();
}

/**
 * Replace the exam's question list in one transaction (order = array order).
 * Only while DRAFT. Written questions never carry negative marks.
 */
export async function setExamQuestions(actor: CurrentUser, id: string, input: z.output<typeof examQuestionsSchema>) {
  const exam = await loadOwnedExam(actor, id);
  if (exam.status !== "DRAFT") throw new ApiError(409, "EXAM_LOCKED", "Unpublish the exam before changing its questions.");

  const ids = input.items.map((i) => i.questionId);
  const qs = await db.question.findMany({ where: { id: { in: ids } }, select: { id: true, type: true, isActive: true, text: true } });
  const byId = new Map(qs.map((q) => [q.id, q]));
  const missing = ids.filter((qid) => !byId.has(qid));
  if (missing.length) throw new ApiError(400, "QUESTION_MISSING", `${missing.length} question(s) no longer exist. Reload the page.`);
  const inactive = qs.filter((q) => !q.isActive);
  if (inactive.length) {
    throw new ApiError(409, "QUESTION_INACTIVE", `Remove deactivated question(s) first: "${inactive[0].text.slice(0, 60)}"${inactive.length > 1 ? ` and ${inactive.length - 1} more` : ""}`);
  }

  await db.$transaction(async (tx) => {
    const res = await tx.exam.updateMany({ where: { id, updatedAt: new Date(input.updatedAt) }, data: { updatedAt: new Date() } });
    if (res.count === 0) throw CONFLICT();
    await tx.examQuestion.deleteMany({ where: { examId: id } });
    if (input.items.length) {
      await tx.examQuestion.createMany({
        data: input.items.map((i, orderIndex) => ({
          examId: id, questionId: i.questionId, marks: i.marks, orderIndex,
          negativeMarks: byId.get(i.questionId)!.type === "WRITTEN" ? 0 : i.negativeMarks,
        })),
      });
    }
  });
}

/**
 * Random pick from the bank by category / difficulty / type. Returns questions to ADD (the
 * builder shows them, the examiner saves). Uses a crypto RNG; never repeats a question.
 */
export async function randomPick(actor: CurrentUser, id: string, input: z.output<typeof randomPickSchema>) {
  await loadOwnedExam(actor, id);
  const taken = new Set(input.excludeIds);
  const picked: string[] = [];
  const shortages: string[] = [];
  const cats = new Map((await db.category.findMany({ select: { id: true, name: true } })).map((c) => [c.id, c.name]));

  for (const [i, r] of input.rules.entries()) {
    const pool = await db.question.findMany({
      where: {
        isActive: true,
        ...(r.categoryId ? { categoryId: r.categoryId } : {}),
        ...(r.difficulty ? { difficulty: r.difficulty } : {}),
        ...(r.type ? { type: r.type } : {}),
      },
      select: { id: true },
    });
    const available = pool.map((p) => p.id).filter((qid) => !taken.has(qid));
    if (available.length < r.count) {
      const what = [r.difficulty?.toLowerCase(), r.type ? r.type.toLowerCase().replace("_", " ") : null, "question(s)", r.categoryId ? `in ${cats.get(r.categoryId) ?? "that category"}` : null]
        .filter(Boolean).join(" ");
      shortages.push(`Rule ${i + 1}: asked for ${r.count} but only ${available.length} ${what} are available (not already in the exam).`);
      continue;
    }
    for (let k = available.length - 1; k > 0; k--) {
      const j = randomInt(k + 1);
      [available[k], available[j]] = [available[j], available[k]];
    }
    for (const qid of available.slice(0, r.count)) {
      taken.add(qid);
      picked.push(qid);
    }
  }
  if (shortages.length) throw new ApiError(409, "NOT_ENOUGH_QUESTIONS", shortages.join(" "));

  const qs = await db.question.findMany({
    where: { id: { in: picked } },
    select: {
      id: true, type: true, text: true, difficulty: true, defaultMarks: true, isActive: true,
      category: { select: { id: true, name: true } }, _count: { select: { options: true } },
    },
  });
  const order = new Map(picked.map((qid, i) => [qid, i]));
  return qs
    .sort((a, b) => order.get(a.id)! - order.get(b.id)!)
    .map((q) => ({
      questionId: q.id, type: q.type, text: q.text, difficulty: q.difficulty, defaultMarks: n(q.defaultMarks),
      marks: n(q.defaultMarks), negativeMarks: 0, isActive: q.isActive, category: q.category, optionCount: q._count.options,
    }));
}

export async function publishExam(actor: CurrentUser, id: string) {
  const exam = await getExam(actor, id);
  if (exam.status === "PUBLISHED") throw new ApiError(409, "ALREADY_PUBLISHED", "This exam is already published.");
  const failing = exam.checks.filter((c) => c.blocking && !c.ok);
  if (failing.length) {
    throw new ApiError(409, "PUBLISH_BLOCKED", `Can't publish yet: ${failing.map((c) => c.label).join("; ")}.`);
  }
  // Guard against a concurrent edit between the checks above and this update.
  const res = await db.exam.updateMany({
    where: { id, status: "DRAFT", updatedAt: new Date(exam.updatedAt) },
    data: { status: "PUBLISHED", publishedAt: new Date() },
  });
  if (res.count === 0) throw CONFLICT();
}

export async function unpublishExam(actor: CurrentUser, id: string) {
  const exam = await loadOwnedExam(actor, id);
  if (exam.status !== "PUBLISHED") throw new ApiError(409, "NOT_PUBLISHED", "This exam is not published.");
  if (exam.startAt && exam.startAt <= new Date()) {
    throw new ApiError(409, "EXAM_LOCKED", "The exam window has opened; it can no longer be unpublished.");
  }
  await db.exam.update({ where: { id }, data: { status: "DRAFT", publishedAt: null } });
}

export async function deleteExam(actor: CurrentUser, id: string) {
  const exam = await loadOwnedExam(actor, id);
  if (exam.status !== "DRAFT") throw new ApiError(409, "EXAM_LOCKED", "Only draft exams can be deleted. Unpublish it first.");
  await db.exam.delete({ where: { id } });
}
