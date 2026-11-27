import "server-only";
import { db } from "@/lib/db";
import type { CurrentUser } from "@/lib/auth/current-user";
import { examPhase } from "@/lib/exams/status";

const ACTION_LABEL: Record<string, string> = {
  USER_UPDATED: "updated a user", PASSWORD_RESET: "reset a password", RESULTS_PUBLISHED: "published results",
  DISPUTE_ACCEPTED: "accepted a dispute", DISPUTE_REJECTED: "rejected a dispute",
};

async function examOverview(where: object) {
  const exams = await db.exam.findMany({
    where, orderBy: { startAt: "asc" },
    select: {
      id: true, title: true, status: true, startAt: true, endAt: true, resultsStatus: true,
      createdBy: { select: { name: true } },
      _count: { select: { enrollments: { where: { status: "ACTIVE" } }, questions: true } },
      attempts: { where: { isSandbox: false }, select: { status: true, pendingCount: true } },
    },
  });
  const now = new Date();
  const rows = exams.map((e) => ({
    id: e.id, title: e.title, owner: e.createdBy.name, phase: examPhase(e, now),
    startAt: e.startAt?.toISOString() ?? null, endAt: e.endAt?.toISOString() ?? null,
    enrolled: e._count.enrollments, questions: e._count.questions, resultsPublished: e.resultsStatus === "PUBLISHED",
    writing: e.attempts.filter((a) => a.status === "IN_PROGRESS").length,
    submitted: e.attempts.filter((a) => a.status !== "IN_PROGRESS").length,
    toMark: e.attempts.reduce((s, a) => s + (a.status !== "IN_PROGRESS" ? a.pendingCount : 0), 0),
  }));
  const phases = { DRAFT: 0, SCHEDULED: 0, ONGOING: 0, COMPLETED: 0 };
  for (const r of rows) phases[r.phase]++;
  return {
    phases, live: rows.filter((r) => r.phase === "ONGOING"),
    upcoming: rows.filter((r) => r.phase === "SCHEDULED").slice(0, 5),
    awaiting: rows.filter((r) => r.phase === "COMPLETED" && !r.resultsPublished),
    toMark: rows.reduce((s, r) => s + r.toMark, 0), rows,
  };
}

/** Platform overview for administrators. */
export async function adminDashboard() {
  const since = new Date(Date.now() - 7 * 86_400_000);
  const [roles, inactive, pendingPw, newUsers, exams, attempts, inProgress, openDisputes, bankSize, logs, logins] = await Promise.all([
    db.user.groupBy({ by: ["role"], _count: true }),
    db.user.count({ where: { isActive: false } }),
    db.user.count({ where: { mustChangePassword: true } }),
    db.user.count({ where: { createdAt: { gte: since } } }),
    examOverview({}),
    db.attempt.count({ where: { isSandbox: false } }),
    db.attempt.count({ where: { isSandbox: false, status: "IN_PROGRESS" } }),
    db.dispute.count({ where: { status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    db.question.count({ where: { isActive: true } }),
    db.auditLog.findMany({ orderBy: { createdAt: "desc" }, take: 8 }),
    db.user.findMany({ where: { lastLoginAt: { not: null } }, orderBy: { lastLoginAt: "desc" }, take: 6, select: { id: true, name: true, role: true, lastLoginAt: true } }),
  ]);
  const actorIds = [...new Set(logs.map((l) => l.actorId))];
  const actors = new Map((await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]));
  const byRole = Object.fromEntries(roles.map((r) => [r.role, r._count])) as Record<string, number>;
  return {
    users: { total: roles.reduce((s, r) => s + r._count, 0), admins: byRole.ADMIN ?? 0, examiners: byRole.EXAMINER ?? 0, candidates: byRole.CANDIDATE ?? 0, inactive, pendingPw, newThisWeek: newUsers },
    exams, attempts: { total: attempts, inProgress }, openDisputes, bankSize,
    activity: logs.map((l) => ({ id: l.id, who: actors.get(l.actorId) ?? "Someone", what: ACTION_LABEL[l.action] ?? l.action.toLowerCase().replace(/_/g, " "), at: l.createdAt.toISOString() })),
    logins: logins.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt!.toISOString() })),
  };
}

/** Overview of the examiner's own exams. */
export async function examinerDashboard(user: CurrentUser) {
  const [exams, openDisputes, myQuestions] = await Promise.all([
    examOverview({ createdById: user.id }),
    db.dispute.count({ where: { attempt: { exam: { createdById: user.id } }, status: { in: ["OPEN", "UNDER_REVIEW"] } } }),
    db.question.count({ where: { createdById: user.id, isActive: true } }),
  ]);
  return { exams, openDisputes, myQuestions };
}
