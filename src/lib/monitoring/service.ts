import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import { loadOwnedExam } from "@/lib/exams/service";
import { finaliseExpired } from "@/lib/candidate/service";
import { GRACE_MS } from "@/lib/attempts/workspace";

export const EVENT_TYPES = ["TAB_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT", "COPY", "PASTE", "CONNECTION_LOST", "CONNECTION_RESTORED", "RESUMED"] as const;
export const EVENT_LABEL: Record<(typeof EVENT_TYPES)[number], string> = {
  TAB_HIDDEN: "Left the exam tab", WINDOW_BLUR: "Switched to another window", FULLSCREEN_EXIT: "Exited fullscreen",
  COPY: "Copied text", PASTE: "Pasted text", CONNECTION_LOST: "Connection lost", CONNECTION_RESTORED: "Connection restored", RESUMED: "Reopened the exam",
};
/** Integrity-relevant (shown as incidents); the rest are connectivity info. */
export const INCIDENT_TYPES = ["TAB_HIDDEN", "WINDOW_BLUR", "FULLSCREEN_EXIT", "COPY", "PASTE"] as const;
const MAX_EVENTS_PER_ATTEMPT = 1000; // flood protection

export const eventBatchSchema = z.object({
  events: z
    .array(
      z.object({
        type: z.enum(EVENT_TYPES),
        at: z.iso.datetime().optional(),
        details: z.record(z.string(), z.union([z.string().max(200), z.number(), z.boolean()])).optional().default({}),
      }),
    )
    .max(50),
});

async function ownRunningAttempt(user: CurrentUser, attemptId: string) {
  const a = await db.attempt.findUnique({ where: { id: attemptId }, select: { userId: true, isSandbox: true, status: true, deadlineAt: true, examId: true } });
  if (!a || a.userId !== user.id) throw new ApiError(404, "NOT_FOUND", "Attempt not found");
  return a;
}

/** Record browser events + heartbeat (last seen). Only while the attempt is running. */
export async function recordEvents(user: CurrentUser, attemptId: string, batch: z.output<typeof eventBatchSchema>) {
  const a = await ownRunningAttempt(user, attemptId);
  if (a.status !== "IN_PROGRESS" || Date.now() > a.deadlineAt.getTime() + GRACE_MS) {
    await finaliseExpired({ attemptId });
    throw new ApiError(409, "TIME_UP", "This attempt is finished.");
  }
  if (batch.events.length) {
    const count = await db.attemptEvent.count({ where: { attemptId } });
    const room = Math.max(0, MAX_EVENTS_PER_ATTEMPT - count);
    const now = Date.now();
    await db.attemptEvent.createMany({
      data: batch.events.slice(0, room).map((e) => {
        // Client time is kept for context only; clamp absurd values. Server time is authoritative.
        const ct = e.at ? new Date(e.at) : null;
        return { attemptId, type: e.type, details: e.details, clientTime: ct && Math.abs(ct.getTime() - now) < 86_400_000 ? ct : null };
      }),
    });
  }
  await db.attempt.update({ where: { id: attemptId }, data: { lastSeenAt: new Date() } });
  return { ok: true, serverNow: new Date().toISOString() };
}

/** Announcements for the candidate's exam (newest first). */
export async function announcementsFor(user: CurrentUser, attemptId: string) {
  const a = await ownRunningAttempt(user, attemptId);
  const list = await db.announcement.findMany({ where: { examId: a.examId }, orderBy: { createdAt: "desc" }, take: 20, select: { id: true, message: true, createdAt: true } });
  return list.map((x) => ({ id: x.id, message: x.message, createdAt: x.createdAt.toISOString() }));
}

export async function postAnnouncement(actor: CurrentUser, examId: string, message: string) {
  const exam = await loadOwnedExam(actor, examId);
  if (exam.status !== "PUBLISHED") throw new ApiError(409, "NOT_PUBLISHED", "Announcements can be sent once the exam is published.");
  if (exam.endAt && exam.endAt <= new Date()) throw new ApiError(409, "EXAM_ENDED", "This exam has ended.");
  return db.announcement.create({ data: { examId, createdById: actor.id, message }, select: { id: true } });
}

/** Live view for the examiner (3.6): running attempts, progress, last seen, incidents. */
export async function monitor(actor: CurrentUser, examId: string) {
  const exam = await loadOwnedExam(actor, examId);
  await finaliseExpired({ examId });
  const [attempts, events, announcements] = await Promise.all([
    db.attempt.findMany({
      where: { examId, isSandbox: false },
      orderBy: { startedAt: "asc" },
      select: {
        id: true, status: true, startedAt: true, deadlineAt: true, submittedAt: true, lastSeenAt: true, questionCount: true,
        user: { select: { name: true, email: true } },
        _count: { select: { answers: { where: { OR: [{ selectedOptionIds: { not: [] } }, { textAnswer: { not: null } }] } } } },
      },
    }),
    db.attemptEvent.findMany({
      where: { attempt: { examId, isSandbox: false } },
      orderBy: { serverTime: "desc" },
      take: 300,
      select: { id: true, type: true, serverTime: true, reviewStatus: true, reviewNote: true, details: true, attempt: { select: { id: true, user: { select: { name: true } } } } },
    }),
    db.announcement.findMany({ where: { examId }, orderBy: { createdAt: "desc" }, select: { id: true, message: true, createdAt: true } }),
  ]);
  const incidentsBy = new Map<string, number>();
  for (const e of events) if ((INCIDENT_TYPES as readonly string[]).includes(e.type) && e.reviewStatus !== "DISMISSED") incidentsBy.set(e.attempt.id, (incidentsBy.get(e.attempt.id) ?? 0) + 1);
  const now = Date.now();
  return {
    serverNow: new Date().toISOString(),
    exam: { id: exam.id, endAt: exam.endAt?.toISOString() ?? null },
    attempts: attempts.map((a) => ({
      id: a.id, candidate: a.user, status: a.status, startedAt: a.startedAt.toISOString(), deadlineAt: a.deadlineAt.toISOString(),
      submittedAt: a.submittedAt?.toISOString() ?? null, lastSeenAt: a.lastSeenAt?.toISOString() ?? null,
      // No contact for 60 s while running → probably offline or closed the page.
      stale: a.status === "IN_PROGRESS" && (!a.lastSeenAt || now - a.lastSeenAt.getTime() > 60_000),
      answered: a._count.answers, total: a.questionCount, incidents: incidentsBy.get(a.id) ?? 0,
    })),
    events: events.map((e) => ({
      id: e.id, type: e.type, label: EVENT_LABEL[e.type], incident: (INCIDENT_TYPES as readonly string[]).includes(e.type),
      at: e.serverTime.toISOString(), review: e.reviewStatus, note: e.reviewNote, details: e.details,
      attemptId: e.attempt.id, candidate: e.attempt.user.name,
    })),
    announcements: announcements.map((x) => ({ id: x.id, message: x.message, createdAt: x.createdAt.toISOString() })),
  };
}

export async function reviewEvent(actor: CurrentUser, examId: string, eventId: string, status: "NOTED" | "DISMISSED" | "UNREVIEWED", note: string | null) {
  await loadOwnedExam(actor, examId);
  const res = await db.attemptEvent.updateMany({
    where: { id: eventId, attempt: { examId } },
    data: { reviewStatus: status, reviewNote: note, reviewedById: actor.id },
  });
  if (!res.count) throw new ApiError(404, "NOT_FOUND", "Event not found");
}
