import Link from "next/link";
import { pageUuid } from "@/lib/params";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { ExamWorkspace } from "@/components/candidate/exam-workspace";
import { LocalTime } from "@/components/local-time";
import { btn } from "@/components/staff-shell";
import { requirePageRole } from "@/lib/auth/page-guards";
import { getPaper } from "@/lib/attempts/workspace";
import { getPrefs } from "@/lib/preferences/service";
import { ApiError } from "@/lib/api";

export const metadata = { title: "Exam · Examora" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole("CANDIDATE", "EXAMINER", "ADMIN");
  const paper = await getPaper(user, pageUuid((await params).id)).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  if (paper.status === "IN_PROGRESS") return <ExamWorkspace paper={paper} initialPrefs={await getPrefs(user.id)} />;

  if (paper.isSandbox) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <section className="w-full max-w-md space-y-4 rounded-3xl border border-line bg-surface p-8 text-center">
          <p className="eyebrow text-muted">Preview finished</p>
          <h1 className="font-display text-3xl">{paper.exam.title}</h1>
          <p className="text-sm">Automatic score on objective questions: <strong className="font-mono">{paper.previewScore ?? 0}</strong> / {paper.totalMarks}</p>
          <p className="text-sm text-muted">This preview was not recorded: it doesn&apos;t appear in results, statistics or analytics.</p>
          <Link href={`/exams/${paper.exam.id}/review`} className={btn.primary}>Back to the exam</Link>
        </section>
      </div>
    );
  }
  const answered = paper.questions.filter((q) => q.answer && (q.answer.selectedOptionIds.length || q.answer.textAnswer?.trim())).length;
  return (
    <CandidateShell name={user.name}>
      <section className="mx-auto max-w-xl overflow-hidden rounded-3xl border border-line bg-surface text-center">
        <div className="header-band px-6 py-6">
          <p className="eyebrow text-on-header-muted">{paper.status === "AUTO_SUBMITTED" ? "Submitted when time ran out" : "Submitted"}</p>
          <h1 className="font-display mt-1 text-3xl">{paper.exam.title}</h1>
        </div>
        <div className="space-y-4 p-6">
          <p className="text-sm">Submitted <LocalTime iso={paper.submittedAt} /> · you answered <strong>{answered}</strong> of {paper.questions.length} questions.</p>
          <p className="text-sm text-muted">Your answers can no longer change. Your result appears in My Exams once your examiner publishes it.</p>
          <Link href="/my-exams" className={btn.secondary}>Back to my exams</Link>
        </div>
      </section>
    </CandidateShell>
  );
}

function Loading() {
  return <div className="grid min-h-screen place-items-center text-muted" aria-busy="true">Loading your exam…</div>;
}

export default function AttemptPage(props: PageProps<"/attempts/[id]">) {
  return <Suspense fallback={<Loading />}><Content params={props.params} /></Suspense>;
}
