import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ShellSkeleton, StaffShell } from "@/components/staff-shell";
import { GradeQuestion } from "@/components/results/grade-question";
import { ResultsActions } from "@/components/results/results-actions";
import { LocalTime } from "@/components/local-time";
import { requirePageRole } from "@/lib/auth/page-guards";
import { getAttemptForGrading } from "@/lib/results/service";
import { llmConfigured } from "@/lib/results/llm";
import { ApiError } from "@/lib/api";
import { loadExamPage } from "../../shared";

export const metadata = { title: "Mark attempt · SecureExam" };

async function Content({ params }: { params: Promise<{ id: string; attemptId: string }> }) {
  const user = await requirePageRole("EXAMINER", "ADMIN");
  const p = await params;
  const exam = await loadExamPage(user, p.id);
  const g = await getAttemptForGrading(user, exam.id, p.attemptId).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  return (
    <StaffShell user={user} active="exams">
      <Link href={`/exams/${exam.id}/results`} className="mb-4 inline-block text-sm font-semibold text-brand hover:underline">← Results of {exam.title}</Link>
      <section className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-line bg-surface p-5">
        <div>
          <p className="eyebrow text-muted">Attempt</p>
          <h1 className="font-display text-2xl">{g.candidate.name}</h1>
          <p className="text-sm text-muted">{g.candidate.email} · submitted <LocalTime iso={g.submittedAt} /></p>
        </div>
        <div className="text-right">
          <p className="font-mono text-3xl font-bold">{g.score ?? "–"} <span className="text-base text-muted">/ {g.totalMarks}</span></p>
          <p className="text-sm">{g.pending ? <span className="font-bold text-[#c99a3d]">{g.pending} answer(s) to mark</span> : <span className="text-success">Fully marked</span>}</p>
        </div>
        {!g.locked && g.pending > 0 && (
          <div className="w-full"><ResultsActions examId={exam.id} attemptId={g.id} aiEnabled={exam.autoCheckWritten} aiAvailable={llmConfigured()} canPublish={false} published={false} showPublish={false} /></div>
        )}
        {g.locked && (
          <p className="w-full text-sm text-muted">
            Results are published: marks can only change through a dispute.{" "}
            <a href={`/api/exams/${exam.id}/attempts/${g.id}/pdf`} className="font-semibold text-brand underline">Download this candidate&apos;s report (PDF)</a>
          </p>
        )}
      </section>
      <div className="space-y-4">
        {g.questions.map((q) => <GradeQuestion key={q.attemptQuestionId} examId={exam.id} attemptId={g.id} q={q} locked={g.locked} />)}
      </div>
    </StaffShell>
  );
}

export default function MarkAttemptPage(props: PageProps<"/exams/[id]/results/[attemptId]">) {
  return <Suspense fallback={<ShellSkeleton />}><Content params={props.params} /></Suspense>;
}
