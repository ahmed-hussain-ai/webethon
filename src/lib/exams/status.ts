// Shown status is DERIVED from the stored status + schedule + current time, so it can never go stale.
export type ExamPhase = "DRAFT" | "SCHEDULED" | "ONGOING" | "COMPLETED";

export function examPhase(e: { status: "DRAFT" | "PUBLISHED"; startAt: Date | string | null; endAt: Date | string | null }, now = new Date()): ExamPhase {
  if (e.status === "DRAFT" || !e.startAt || !e.endAt) return "DRAFT";
  const start = new Date(e.startAt);
  const end = new Date(e.endAt);
  if (now < start) return "SCHEDULED";
  if (now < end) return "ONGOING";
  return "COMPLETED";
}

export const PHASE_LABEL: Record<ExamPhase, string> = {
  DRAFT: "Draft",
  SCHEDULED: "Published · upcoming",
  ONGOING: "Ongoing",
  COMPLETED: "Completed",
};

export type ReadinessCheck = { key: string; ok: boolean; label: string; blocking: boolean };

/** Everything that must be true to publish (blocking) plus useful warnings. */
export function readiness(e: {
  title: string;
  startAt: Date | null;
  endAt: Date | null;
  durationMinutes: number;
  totalMarks: number;
  passMarks: number;
  questionCount: number;
  assignedMarks: number;
  inactiveCount: number;
  activeEnrollments: number;
}, now = new Date()): ReadinessCheck[] {
  const sched = !!(e.startAt && e.endAt);
  const windowOk = sched && e.endAt!.getTime() - e.startAt!.getTime() >= e.durationMinutes * 60_000;
  const marksMatch = Math.abs(e.assignedMarks - e.totalMarks) < 0.005;
  return [
    { key: "title", ok: e.title.trim().length > 0, label: "Exam has a title", blocking: true },
    { key: "schedule", ok: sched, label: "Start and end time are set", blocking: true },
    { key: "future", ok: sched && e.endAt! > now, label: "End time is in the future", blocking: true },
    { key: "window", ok: windowOk, label: `Window is at least as long as the duration (${e.durationMinutes} min)`, blocking: true },
    { key: "questions", ok: e.questionCount > 0, label: `At least one question (${e.questionCount} added)`, blocking: true },
    { key: "inactive", ok: e.inactiveCount === 0, label: e.inactiveCount ? `${e.inactiveCount} deactivated question(s) must be removed` : "All questions are active", blocking: true },
    { key: "marks", ok: marksMatch, label: `Question marks add up to the total (${round(e.assignedMarks)} of ${round(e.totalMarks)})`, blocking: true },
    { key: "pass", ok: e.passMarks <= e.totalMarks, label: `Pass marks (${round(e.passMarks)}) are within the total`, blocking: true },
    { key: "candidates", ok: e.activeEnrollments > 0, label: e.activeEnrollments ? `${e.activeEnrollments} candidate(s) enrolled` : "No candidates enrolled yet (you can enroll after publishing)", blocking: false },
    { key: "startsLater", ok: !sched || e.startAt! > now, label: sched && e.startAt! <= now ? "Start time has passed: the exam opens immediately when published" : "Start time is in the future", blocking: false },
  ];
}

const round = (n: number) => Math.round(n * 100) / 100;
