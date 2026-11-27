import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { Countdown } from "@/components/candidate/countdown";
import { LocalTime } from "@/components/local-time";
import { ShellSkeleton, btn } from "@/components/staff-shell";
import { requirePageRole } from "@/lib/auth/page-guards";
import { getMyAttempt } from "@/lib/candidate/service";
import { ApiError } from "@/lib/api";

export const metadata = { title: "Exam in progress · SecureExam" };

// Temporary attempt page: the full exam workspace (questions, autosave, review) is the next feature.
async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const a = await getMyAttempt(user, (await params).id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });
  const running = a.status === "IN_PROGRESS";
  return (
    <CandidateShell name={user.name}>
      <section className="mx-auto max-w-xl overflow-hidden rounded-3xl border border-line bg-surface text-center">
        <div className="header-band px-6 py-6">
          <p className="eyebrow text-on-header-muted">{running ? "Exam in progress" : "Exam finished"}</p>
          <h1 className="font-display mt-1 text-3xl">{a.exam.title}</h1>
        </div>
        <div className="space-y-4 p-6">
          {running ? (
            <>
              <p className="eyebrow text-muted">Time left</p>
              <p className="text-5xl"><Countdown target={a.deadlineAt} serverNow={a.serverNow} refreshAtZero /></p>
              <p className="text-sm text-muted">Ends at <LocalTime iso={a.deadlineAt} /> · {a.questionCount} questions · {a.totalMarks} marks</p>
              <p className="rounded-2xl bg-notice p-3 text-sm">The question screen is being built next. Your attempt and timer are already saved on the server.</p>
            </>
          ) : (
            <p className="text-sm">
              {a.status === "AUTO_SUBMITTED" ? "Submitted automatically when time ran out" : "Submitted"} on <LocalTime iso={a.submittedAt} />.
            </p>
          )}
          <Link href="/my-exams" className={btn.secondary}>Back to my exams</Link>
        </div>
      </section>
    </CandidateShell>
  );
}

export default function AttemptPage(props: PageProps<"/attempts/[id]">) {
  return <Suspense fallback={<ShellSkeleton />}><Content params={props.params} /></Suspense>;
}
