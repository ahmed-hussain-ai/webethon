import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { LocalTime } from "@/components/local-time";
import { CandidateDisputes } from "@/components/disputes/candidate-disputes";
import { ShellSkeleton, btn } from "@/components/staff-shell";
import { requirePageRole } from "@/lib/auth/page-guards";
import { getMyResult } from "@/lib/results/service";
import { ApiError } from "@/lib/api";

export const metadata = { title: "Result · SecureExam" };
const LETTERS = "ABCDEFGHIJ";

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const r = await getMyResult(user, (await params).id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  return (
    <CandidateShell name={user.name}>
      <Link href="/my-exams" className="mb-4 inline-block text-sm font-semibold text-brand hover:underline">← My exams</Link>
      <section className="mb-6 overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="header-band flex flex-wrap items-end justify-between gap-4 px-6 py-6">
          <div>
            <p className="eyebrow text-on-header-muted">Result</p>
            <h1 className="font-display mt-1 text-3xl">{r.exam.title}</h1>
            <p className="mt-1 text-sm text-on-header-muted">Published <LocalTime iso={r.publishedAt} /></p>
          </div>
          <div className="text-right">
            <p className="font-mono text-4xl font-bold">{r.score}<span className="text-lg opacity-70"> / {r.total}</span></p>
            <p className="font-semibold">{r.percent}% · {r.passed ? "Passed" : "Not passed"} <span className="opacity-70">(pass mark {r.passMarks})</span></p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 px-6 py-4 text-sm">
          <a href={`/api/my/results/${r.attemptId}/pdf`} className={btn.primary}>Download PDF report</a>
          <span className="text-muted">Includes a verification code anyone can check at /verify.</span>
        </div>
      </section>
      <div className="mb-6"><CandidateDisputes attemptId={r.attemptId} questions={r.questions.map((q) => ({ id: q.attemptQuestionId, number: q.number }))} /></div>
      <div className="space-y-4">
        {r.questions.map((q) => (
          <article key={q.attemptQuestionId} className="rounded-3xl border border-line bg-surface">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <p className="eyebrow text-muted">Question {q.number}</p>
              <p className="font-mono text-sm font-semibold">{q.awarded} / {q.marks}</p>
            </div>
            <div className="space-y-3 p-5 text-sm">
              <p className="whitespace-pre-wrap text-base">{q.text}</p>
              {q.type !== "WRITTEN" ? (
                <ul className="space-y-1.5">
                  {q.options.map((o, i) => {
                    const picked = q.selected.includes(o.id);
                    return (
                      <li key={o.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${o.correct ? "border-success/50 bg-success-soft" : picked ? "border-danger-line bg-danger-soft" : "border-line"}`}>
                        <span className="font-mono text-xs font-bold">{LETTERS[i]}</span>
                        <span className="flex-1">{o.text}</span>
                        {picked && <span className="text-xs font-bold">Your answer</span>}
                        {o.correct && <span className="text-xs font-bold text-success">Correct</span>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-2xl bg-surface-2 p-3"><p className="eyebrow mb-1 text-muted">Your answer</p><p className="whitespace-pre-wrap">{q.textAnswer?.trim() || <span className="text-muted">No answer</span>}</p></div>
                  <div className="rounded-2xl bg-success-soft p-3"><p className="eyebrow mb-1 text-muted">Correct answer</p><p className="whitespace-pre-wrap">{q.modelAnswer}</p></div>
                </div>
              )}
              {q.feedback && <p className="rounded-xl border border-notice-line bg-notice p-3"><strong>Examiner feedback:</strong> {q.feedback}</p>}
            </div>
          </article>
        ))}
      </div>
    </CandidateShell>
  );
}

export default function ResultPage(props: PageProps<"/results/[id]">) {
  return <Suspense fallback={<ShellSkeleton />}><Content params={props.params} /></Suspense>;
}
