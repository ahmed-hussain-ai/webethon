import { Suspense } from "react";
import { ShellSkeleton, StaffShell } from "@/components/staff-shell";
import { ExamHeader } from "@/components/exams/exam-header";
import { ExamActions } from "@/components/exams/exam-actions";
import { DifficultyBadge, TypeBadge } from "@/components/badges";
import { LocalTime } from "@/components/local-time";
import { requirePageRole } from "@/lib/auth/page-guards";
import { MULTI_RULE_LABEL } from "@/lib/validation/exams";
import { loadExamPage } from "../shared";

export const metadata = { title: "Review exam · Examora" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole("EXAMINER", "ADMIN");
  const exam = await loadExamPage(user, (await params).id);
  const blocking = exam.checks.filter((c) => c.blocking);
  const warnings = exam.checks.filter((c) => !c.blocking && !c.ok);
  const canPublish = blocking.every((c) => c.ok);
  const settings: [string, string][] = [
    ["Multiple-select marking", MULTI_RULE_LABEL[exam.multiSelectRule]],
    ["Objective questions", "Marked automatically, reviewed by you before publishing"],
    ["Written answers", exam.autoCheckWritten ? "AI suggests a mark against your correct answer; you review it" : "Marked by you"],
    ["Question order", exam.shuffleQuestions ? "Shuffled per candidate" : "Same order for everyone"],
    ["Answer options", exam.shuffleOptions ? "Shuffled per candidate" : "Same order for everyone"],
    ["Pass marks", `${exam.passMarks} of ${exam.totalMarks}`],
  ];

  return (
    <StaffShell user={user} active="exams">
      <ExamHeader exam={exam} tab="review" />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <section aria-labelledby="checks" className="h-fit space-y-4 rounded-3xl border border-line bg-surface p-5">
          <h2 id="checks" className="font-display text-2xl">{exam.status === "DRAFT" ? "Ready to publish?" : "Status"}</h2>
          {exam.status === "DRAFT" ? (
            <ul className="space-y-2">
              {blocking.map((c) => (
                <li key={c.key} className="flex items-start gap-2.5 text-sm">
                  <span aria-hidden className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full text-[0.7rem] font-bold ${c.ok ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{c.ok ? "✓" : "✗"}</span>
                  <span className={c.ok ? "" : "font-semibold text-danger"}><span className="sr-only">{c.ok ? "Done: " : "To fix: "}</span>{c.label}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">
              Published <LocalTime iso={exam.publishedAt} />.{" "}
              {exam.phase === "SCHEDULED" ? "You can still unpublish it until it opens." : exam.phase === "ONGOING" ? "The exam is running." : "The exam has ended."}
            </p>
          )}
          {warnings.length > 0 && (
            <ul className="space-y-1.5 rounded-2xl border border-notice-line bg-notice p-3 text-sm">
              {warnings.map((w) => <li key={w.key}>⚠ {w.label}</li>)}
            </ul>
          )}
          <ExamActions examId={exam.id} status={exam.status} canPublish={canPublish} canUnpublish={exam.canUnpublish} canDelete={exam.canDelete} />
        </section>

        <div className="space-y-6">
          <section aria-labelledby="settings-summary" className="rounded-3xl border border-line bg-surface p-5">
            <h2 id="settings-summary" className="eyebrow mb-3 text-muted">How it will run</h2>
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
              <div><dt className="text-muted">Window</dt><dd className="font-semibold"><LocalTime iso={exam.startAt} withYear /> → <LocalTime iso={exam.endAt} /></dd></div>
              <div><dt className="text-muted">Time per candidate</dt><dd className="font-semibold">{exam.durationMinutes} minutes (never past closing time)</dd></div>
              {settings.map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="font-semibold">{v}</dd></div>)}
            </dl>
            {exam.instructions && (
              <div className="mt-4 rounded-2xl bg-surface-2 p-4">
                <p className="eyebrow mb-1 text-muted">Instructions</p>
                <p className="whitespace-pre-wrap text-sm">{exam.instructions}</p>
              </div>
            )}
          </section>

          <section aria-labelledby="paper-summary" className="rounded-3xl border border-line bg-surface">
            <h2 id="paper-summary" className="eyebrow px-5 pt-5 text-muted">Paper · {exam.questions.length} questions · {exam.assignedMarks} marks</h2>
            {exam.questions.length === 0 ? (
              <p className="px-5 py-8 text-sm text-muted">No questions yet.</p>
            ) : (
              <ol className="mt-3 divide-y divide-[var(--border)]">
                {exam.questions.map((q, i) => (
                  <li key={q.questionId} className="flex items-start gap-3 px-5 py-3 text-sm">
                    <span className="w-6 shrink-0 font-mono text-muted">{i + 1}.</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2">{q.text}</p>
                      <div className="mt-1 flex flex-wrap gap-1"><TypeBadge type={q.type} /><DifficultyBadge difficulty={q.difficulty} /><span className="text-xs text-muted">· {q.category.name}</span></div>
                    </div>
                    <span className="shrink-0 font-mono">{q.marks}{q.negativeMarks > 0 && <span className="text-danger"> / −{q.negativeMarks}</span>}</span>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </div>
      </div>
    </StaffShell>
  );
}

export default function ExamReviewPage(props: PageProps<"/exams/[id]/review">) {
  return <Suspense fallback={<ShellSkeleton />}><Content params={props.params} /></Suspense>;
}
