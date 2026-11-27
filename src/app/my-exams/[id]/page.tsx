import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { Countdown } from "@/components/candidate/countdown";
import { StartExam } from "@/components/candidate/start-exam";
import { LocalTime } from "@/components/local-time";
import { ShellSkeleton, btn } from "@/components/staff-shell";
import { FormAlert } from "@/components/ui";
import { requirePageRole } from "@/lib/auth/page-guards";
import { getLobby } from "@/lib/candidate/service";
import { ApiError } from "@/lib/api";
import { MULTI_RULE_LABEL } from "@/lib/validation/exams";

export const metadata = { title: "Exam · SecureExam" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole("CANDIDATE");
  const e = await getLobby(user, (await params).id).catch((err) => {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  });

  return (
    <CandidateShell name={user.name}>
      <Link href="/my-exams" className="mb-4 inline-block text-sm font-semibold text-brand hover:underline">← My exams</Link>
      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="header-band px-6 py-6">
            <p className="eyebrow text-on-header-muted">Exam</p>
            <h1 className="font-display mt-1 text-3xl break-words">{e.title}</h1>
            {e.description && <p className="mt-2 text-sm text-on-header-muted">{e.description}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-px bg-line text-sm sm:grid-cols-4">
            {[["Questions", e.questionCount], ["Total marks", e.totalMarks], ["Pass marks", e.passMarks], ["Duration", `${e.durationMinutes} min`]].map(([k, v]) => (
              <div key={k as string} className="bg-surface px-5 py-3"><dt className="eyebrow text-muted">{k}</dt><dd className="mt-0.5 font-semibold">{v}</dd></div>
            ))}
          </dl>
          <div className="space-y-4 p-6">
            <p className="text-sm"><span className="text-muted">Window:</span> <strong><LocalTime iso={e.startAt} withYear /></strong> → <strong><LocalTime iso={e.endAt} /></strong></p>
            <div>
              <h2 className="eyebrow mb-2 text-muted">Instructions</h2>
              {e.instructions ? <p className="whitespace-pre-wrap text-sm leading-relaxed">{e.instructions}</p> : <p className="text-sm text-muted">No special instructions.</p>}
            </div>
            <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
              <li>You get one attempt. Once started, the timer keeps running even if you close the page or lose connection.</li>
              <li>The exam is submitted automatically when your time runs out or the exam closes, whichever comes first.</li>
              <li>Multiple-select questions: {MULTI_RULE_LABEL[e.multiSelectRule].toLowerCase()}.</li>
              <li>For fairness, leaving the exam tab, switching windows, copy/paste{e.requireFullscreen ? ", leaving fullscreen" : ""} and connection drops are recorded for your examiner to review. No camera or microphone is used.</li>
            </ul>
          </div>
        </section>

        <aside className="h-fit space-y-4 rounded-3xl border border-line bg-surface p-5 lg:sticky lg:top-4" aria-live="polite">
          {e.state === "UPCOMING" && (
            <>
              <h2 className="font-display text-xl">Opens in</h2>
              <p className="text-3xl"><Countdown target={e.startAt} serverNow={e.serverNow} refreshAtZero /></p>
              <p className="text-sm text-muted">Keep this page open; the Start button appears when the exam opens.</p>
            </>
          )}
          {(e.state === "AVAILABLE" || e.state === "IN_PROGRESS") && (
            <>
              <h2 className="font-display text-xl">{e.state === "IN_PROGRESS" ? "Your exam is in progress" : "Ready when you are"}</h2>
              {e.state === "IN_PROGRESS" && e.attempt ? (
                <>
                  <p className="text-sm">Time left: <Countdown target={e.attempt.deadlineAt} serverNow={e.serverNow} refreshAtZero className="text-lg font-bold" /></p>
                  <Link className={`${btn.primary} w-full`} href={`/attempts/${e.attempt.id}`}>Resume exam</Link>
                </>
              ) : (
                <>
                  <p className="text-sm">Closes in <Countdown target={e.endAt} serverNow={e.serverNow} refreshAtZero className="font-bold" /></p>
                  <StartExam examId={e.id} resume={false} minutes={e.minutesIfStartedNow} shortened={e.shortened} />
                </>
              )}
            </>
          )}
          {e.state === "TOO_LATE" && <FormAlert>The exam closes in less than a minute, so it can no longer be started.</FormAlert>}
          {e.state === "SUBMITTED" && e.attempt && (
            <>
              <h2 className="font-display text-xl">Submitted</h2>
              <p className="text-sm">
                {e.attempt.status === "AUTO_SUBMITTED" ? "Submitted automatically when time ran out" : "You submitted"} on{" "}
                <LocalTime iso={e.attempt.submittedAt} />.
              </p>
              {e.result ? (
                <>
                  <p className="font-mono text-3xl font-bold">{e.result.score}<span className="text-base text-muted"> / {e.totalMarks}</span></p>
                  <p className={`text-sm font-bold ${e.result.passed ? "text-success" : "text-danger"}`}>{e.result.percent}% · {e.result.passed ? "Passed" : "Not passed"}</p>
                  <Link className={`${btn.primary} w-full`} href={`/results/${e.attempt.id}`}>View full result</Link>
                </>
              ) : (
                <p className="text-sm text-muted">Your result will appear here once your examiner publishes it.</p>
              )}
            </>
          )}
          {e.state === "MISSED" && (
            <>
              <h2 className="font-display text-xl">Exam closed</h2>
              <p className="text-sm text-muted">This exam closed <LocalTime iso={e.endAt} /> and you did not start it.</p>
            </>
          )}
        </aside>
      </div>
    </CandidateShell>
  );
}

export default function LobbyPage(props: PageProps<"/my-exams/[id]">) {
  return <Suspense fallback={<ShellSkeleton />}><Content params={props.params} /></Suspense>;
}
