import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import { gradeAttempt } from "@/lib/attempts/grading";

/** Refuse to start with less than this left: a candidate shouldn't burn their only attempt on seconds. */
export const MIN_START_SECONDS = 60;

const n = (d: Prisma.Decimal | number) => Number(d);
const NOT_FOUND = () => new ApiError(404, "NOT_FOUND", "Exam not found");

export type LobbyState =
  | "UPCOMING" // published, not open yet
  | "AVAILABLE" // open, no attempt yet
  | "IN_PROGRESS" // attempt running
  | "SUBMITTED" // attempt finished (by candidate or at deadline)
  | "MISSED" // window closed without an attempt
  | "TOO_LATE" // open, but less than MIN_START_SECONDS left
  | "REMOVED"; // enrollment revoked before starting

/**
 * Deadline rule (also enforced by a DB trigger): the candidate gets the full duration from
 * the moment they start, but never past the exam's closing time.
 */
export function deadlineFor(startAt: Date, durationMinutes: number, endAt: Date) {
  return new Date(Math.min(startAt.getTime() + durationMinutes * 60_000, endAt.getTime()));
}

/**
 * Expired attempts are finalised lazily (no background job needed): any read of an attempt
 * past its deadline closes it with submitted_at = deadline. Atomic, so concurrent calls are safe.
 */
export async function finaliseExpired(where: { userId?: string; examId?: string; attemptId?: string }) {
  const closed = await db.$queryRaw<{ id: string }[]>`
    UPDATE attempts SET status = 'AUTO_SUBMITTED', submitted_at = deadline_at
     WHERE status = 'IN_PROGRESS' AND deadline_at <= now()
       AND (${where.userId ?? null}::uuid IS NULL OR user_id = ${where.userId ?? null}::uuid)
       AND (${where.examId ?? null}::uuid IS NULL OR exam_id = ${where.examId ?? null}::uuid)
       AND (${where.attemptId ?? null}::uuid IS NULL OR id = ${where.attemptId ?? null}::uuid)
 RETURNING id`;
  // Mark the objective questions of every attempt that just closed.
  for (const { id } of closed) await gradeAttempt(id);
}

type ExamRow = { id: string; status: "DRAFT" | "PUBLISHED"; startAt: Date | null; endAt: Date | null; durationMinutes: number };
type AttemptRow = { id: string; status: "IN_PROGRESS" | "SUBMITTED" | "AUTO_SUBMITTED"; deadlineAt: Date; submittedAt: Date | null; startedAt: Date } | null;

function stateOf(exam: ExamRow, enrollmentActive: boolean, attempt: AttemptRow, now: Date): LobbyState {
  if (attempt) return attempt.status === "IN_PROGRESS" ? "IN_PROGRESS" : "SUBMITTED";
  if (!enrollmentActive) return "REMOVED";
  if (now < exam.startAt!) return "UPCOMING";
  if (now >= exam.endAt!) return "MISSED";
  if (exam.endAt!.getTime() - now.getTime() < MIN_START_SECONDS * 1000) return "TOO_LATE";
  return "AVAILABLE";
}

/** Exams this candidate may see: PUBLISHED, and either actively enrolled or already attempted. */
async function visibleExams(userId: string, examId?: string) {
  return db.exam.findMany({
    where: {
      status: "PUBLISHED",
      ...(examId ? { id: examId } : {}),
      OR: [
        { enrollments: { some: { candidateId: userId, status: "ACTIVE" } } },
        { attempts: { some: { userId, isSandbox: false } } },
      ],
    },
    select: {
      id: true, title: true, description: true, instructions: true, status: true, startAt: true, endAt: true,
      durationMinutes: true, totalMarks: true, passMarks: true, resultsStatus: true, multiSelectRule: true,
      _count: { select: { questions: true } },
      enrollments: { where: { candidateId: userId }, select: { status: true } },
      attempts: {
        where: { userId, isSandbox: false },
        select: { id: true, status: true, deadlineAt: true, submittedAt: true, startedAt: true, totalScore: true },
      },
    },
    orderBy: { startAt: "asc" },
  });
}

function shape(e: Awaited<ReturnType<typeof visibleExams>>[number], now: Date) {
  const attempt = e.attempts[0] ?? null;
  const state = stateOf(e, e.enrollments[0]?.status === "ACTIVE", attempt, now);
  // What starting NOW would give (for the "you'll only get N minutes" warning).
  const ifStartedNow = state === "AVAILABLE" || state === "TOO_LATE" ? deadlineFor(now, e.durationMinutes, e.endAt!) : null;
  const minutesIfStartedNow = ifStartedNow ? Math.max(0, Math.floor((ifStartedNow.getTime() - now.getTime()) / 60_000)) : null;
  return {
    id: e.id, title: e.title, description: e.description, state,
    startAt: e.startAt!.toISOString(), endAt: e.endAt!.toISOString(), durationMinutes: e.durationMinutes,
    totalMarks: n(e.totalMarks), questionCount: e._count.questions,
    minutesIfStartedNow, shortened: minutesIfStartedNow !== null && minutesIfStartedNow < e.durationMinutes,
    resultsPublished: e.resultsStatus === "PUBLISHED",
    // Score only once the examiner has published results.
    result: e.resultsStatus === "PUBLISHED" && attempt && attempt.status !== "IN_PROGRESS" && attempt.totalScore !== null
      ? {
          score: n(attempt.totalScore),
          percent: Math.round((n(attempt.totalScore) / n(e.totalMarks)) * 10000) / 100,
          passed: n(attempt.totalScore) >= n(e.passMarks),
        }
      : null,
    attempt: attempt && {
      id: attempt.id, status: attempt.status, startedAt: attempt.startedAt.toISOString(),
      deadlineAt: attempt.deadlineAt.toISOString(), submittedAt: attempt.submittedAt?.toISOString() ?? null,
    },
  };
}

export async function listMyExams(user: CurrentUser) {
  await finaliseExpired({ userId: user.id });
  const now = new Date();
  const exams = (await visibleExams(user.id)).map((e) => shape(e, now)).filter((e) => e.state !== "REMOVED");
  const available = exams.filter((e) => e.state === "IN_PROGRESS" || e.state === "AVAILABLE" || e.state === "TOO_LATE");
  const upcoming = exams.filter((e) => e.state === "UPCOMING");
  const completed = exams
    .filter((e) => e.state === "SUBMITTED" || e.state === "MISSED")
    .sort((a, b) => b.endAt.localeCompare(a.endAt));
  return { serverNow: now.toISOString(), available, upcoming, completed };
}

export async function getLobby(user: CurrentUser, examId: string) {
  await finaliseExpired({ userId: user.id, examId });
  const [e] = await visibleExams(user.id, examId);
  if (!e) throw NOT_FOUND(); // draft, not enrolled, or doesn't exist: all look the same
  const now = new Date();
  const s = shape(e, now);
  if (s.state === "REMOVED") throw NOT_FOUND();
  return {
    ...s, instructions: e.instructions, passMarks: n(e.passMarks), multiSelectRule: e.multiSelectRule,
    serverNow: now.toISOString(),
  };
}
export type Lobby = Awaited<ReturnType<typeof getLobby>>;

function shuffled<T>(xs: T[]): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Start (or resume) the candidate's attempt. Idempotent: a double click, a second tab or a
 * retried request after a network drop all get the SAME attempt back.
 */
export async function startAttempt(user: CurrentUser, examId: string) {
  await finaliseExpired({ userId: user.id, examId });
  const existing = await db.attempt.findFirst({ where: { examId, userId: user.id, isSandbox: false }, select: { id: true, status: true } });
  if (existing) return { attemptId: existing.id, resumed: true, status: existing.status };

  const exam = await db.exam.findUnique({
    where: { id: examId },
    include: {
      enrollments: { where: { candidateId: user.id }, select: { status: true } },
      questions: {
        orderBy: [{ orderIndex: "asc" }, { id: "asc" }],
        include: {
          question: {
            include: { options: { orderBy: [{ orderIndex: "asc" }, { id: "asc" }] }, category: { select: { name: true } } },
          },
        },
      },
    },
  });
  // Not enrolled / draft / missing → identical 404 (doesn't reveal the exam exists).
  if (!exam || exam.status !== "PUBLISHED" || !exam.enrollments.length) throw NOT_FOUND();
  if (exam.enrollments[0].status !== "ACTIVE") throw new ApiError(403, "NOT_ELIGIBLE", "You have been removed from this exam. Contact your examiner.");

  const now = new Date();
  if (now < exam.startAt!) throw new ApiError(409, "EXAM_NOT_OPEN", "This exam has not opened yet.");
  if (now >= exam.endAt!) throw new ApiError(409, "EXAM_CLOSED", "This exam has closed.");
  if (exam.endAt!.getTime() - now.getTime() < MIN_START_SECONDS * 1000) {
    throw new ApiError(409, "EXAM_CLOSED", "The exam closes in less than a minute, so it can no longer be started.");
  }
  if (!exam.questions.length) throw new ApiError(409, "NOT_ELIGIBLE", "This exam has no questions. Contact your examiner.");

  // Freeze the paper: question order, option order, marks and the correct answers (server-side only).
  const order = exam.shuffleQuestions ? shuffled(exam.questions) : exam.questions;
  const paper = order.map((eq, orderIndex) => {
    const q = eq.question;
    const opts = q.type === "WRITTEN" ? [] : exam.shuffleOptions ? shuffled(q.options) : q.options;
    return {
      questionId: q.id,
      orderIndex,
      optionOrder: opts.map((o) => o.id),
      marks: eq.marks,
      negativeMarks: q.type === "WRITTEN" ? 0 : eq.negativeMarks,
      snapshot: {
        type: q.type, text: q.text, difficulty: q.difficulty, category: q.category.name,
        options: opts.map((o) => ({ id: o.id, text: o.text })),
        correctOptionIds: q.options.filter((o) => o.isCorrect).map((o) => o.id),
        modelAnswer: q.modelAnswer,
      },
    };
  });
  const totalMarks = paper.reduce((s, p) => s + n(p.marks), 0);

  try {
    const attempt = await db.$transaction(async (tx) => {
      const a = await tx.attempt.create({
        data: {
          examId, userId: user.id, startedAt: now,
          deadlineAt: deadlineFor(now, exam.durationMinutes, exam.endAt!),
          questionCount: paper.length, totalMarks,
        },
        select: { id: true },
      });
      await tx.attemptQuestion.createMany({ data: paper.map((p) => ({ ...p, attemptId: a.id })) });
      return a;
    });
    return { attemptId: attempt.id, resumed: false, status: "IN_PROGRESS" as const };
  } catch (e) {
    // Two requests raced (double click / two tabs): the unique index let only one win.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      const winner = await db.attempt.findFirst({ where: { examId, userId: user.id, isSandbox: false }, select: { id: true, status: true } });
      if (winner) return { attemptId: winner.id, resumed: true, status: winner.status };
    }
    throw e;
  }
}

/** The candidate's own attempt (others' attempts are a 404). No answer keys are returned. */
export async function getMyAttempt(user: CurrentUser, attemptId: string) {
  await finaliseExpired({ attemptId });
  const a = await db.attempt.findUnique({
    where: { id: attemptId },
    select: {
      id: true, userId: true, isSandbox: true, status: true, startedAt: true, deadlineAt: true, submittedAt: true,
      questionCount: true, totalMarks: true,
      exam: { select: { id: true, title: true, endAt: true } },
    },
  });
  if (!a || a.userId !== user.id || a.isSandbox) throw new ApiError(404, "NOT_FOUND", "Attempt not found");
  return {
    id: a.id, status: a.status, startedAt: a.startedAt.toISOString(), deadlineAt: a.deadlineAt.toISOString(),
    submittedAt: a.submittedAt?.toISOString() ?? null, questionCount: a.questionCount, totalMarks: n(a.totalMarks),
    exam: { id: a.exam.id, title: a.exam.title }, serverNow: new Date().toISOString(),
  };
}
