import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { CandidateShell } from "@/components/candidate/candidate-shell";
import { Countdown } from "@/components/candidate/countdown";
import { LocalTime } from "@/components/local-time";
import { ShellSkeleton, btn } from "@/components/staff-shell";
import { requirePageRole } from "@/lib/auth/page-guards";
import { listMyExams } from "@/lib/candidate/service";

export const metadata = { title: "My Exams · SecureExam" };

type Item = Awaited<ReturnType<typeof listMyExams>>["available"][number];

function Section({ title, hint, children, empty }: { title: string; hint: string; children: ReactNode[]; empty: string }) {
  return (
    <section aria-label={title} className="space-y-3">
      <div className="flex items-baseline gap-3">
        <h2 className="font-display text-2xl">{title}</h2>
        <span className="font-mono text-sm text-muted">{children.length}</span>
      </div>
      <p className="text-sm text-muted">{hint}</p>
      {children.length ? <ul className="grid gap-4 md:grid-cols-2">{children}</ul> : <p className="rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-8 text-center text-sm text-muted">{empty}</p>}
    </section>
  );
}

function Card({ e, serverNow }: { e: Item; serverNow: string }) {
  const status: Record<string, [string, string]> = {
    AVAILABLE: ["Open now", "border-success/40 bg-success-soft text-success"],
    TOO_LATE: ["Closing", "border-danger-line bg-danger-soft text-danger"],
    IN_PROGRESS: ["In progress", "border-notice-line bg-notice text-ink"],
    UPCOMING: ["Upcoming", "border-line-strong bg-surface-2 text-muted"],
    SUBMITTED: [e.attempt?.status === "AUTO_SUBMITTED" ? "Submitted at time-up" : "Submitted", "border-line bg-surface-2 text-ink"],
    MISSED: ["Not attempted", "border-line bg-surface-2 text-muted"],
  };
  const [label, cls] = status[e.state];
  return (
    <li className="flex h-full flex-col rounded-3xl border border-line bg-surface p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="font-display text-xl break-words">{e.title}</h3>
        <span className={`shrink-0 rounded-full border px-3 py-1 text-xs font-bold ${cls}`}>{label}</span>
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1 font-mono text-sm text-muted">
        <div><dt className="sr-only">Questions</dt><dd><strong className="text-ink">{e.questionCount}</strong> questions</dd></div>
        <div><dt className="sr-only">Marks</dt><dd><strong className="text-ink">{e.totalMarks}</strong> marks</dd></div>
        <div><dt className="sr-only">Duration</dt><dd><strong className="text-ink">{e.durationMinutes}</strong> min</dd></div>
      </dl>
      <div className="mt-3 flex-1 text-sm">
        {e.state === "UPCOMING" && <p>Opens <LocalTime iso={e.startAt} /> · in <Countdown target={e.startAt} serverNow={serverNow} refreshAtZero className="font-semibold" /></p>}
        {(e.state === "AVAILABLE" || e.state === "TOO_LATE") && <p>Closes <LocalTime iso={e.endAt} /> · in <Countdown target={e.endAt} serverNow={serverNow} refreshAtZero className="font-semibold" /></p>}
        {e.state === "AVAILABLE" && e.shortened && <p className="mt-1 text-danger">You&apos;ll only get {e.minutesIfStartedNow} of {e.durationMinutes} minutes if you start now.</p>}
        {e.state === "IN_PROGRESS" && e.attempt && <p>Time left: <Countdown target={e.attempt.deadlineAt} serverNow={serverNow} refreshAtZero className="font-semibold" /></p>}
        {e.state === "SUBMITTED" && e.attempt?.submittedAt && <p>Submitted <LocalTime iso={e.attempt.submittedAt} /> · {e.resultsPublished ? "Result published" : "Result not published yet"}</p>}
        {e.state === "MISSED" && <p className="text-muted">Closed <LocalTime iso={e.endAt} /> without an attempt.</p>}
      </div>
      <div className="mt-4">
        {e.state === "IN_PROGRESS" && e.attempt ? (
          <Link className={btn.primary} href={`/attempts/${e.attempt.id}`}>Resume exam</Link>
        ) : (
          <Link className={e.state === "AVAILABLE" ? btn.primary : btn.secondary} href={`/my-exams/${e.id}`}>
            {e.state === "AVAILABLE" ? "Open exam" : "View details"}
          </Link>
        )}
      </div>
    </li>
  );
}

async function Content() {
  const user = await requirePageRole("CANDIDATE");
  const data = await listMyExams(user);
  return (
    <CandidateShell name={user.name}>
      <div className="mb-8">
        <p className="eyebrow text-muted">Candidate</p>
        <h1 className="font-display mt-1 text-3xl">My exams</h1>
      </div>
      <div className="space-y-10">
        <Section title="Available now" hint="Open exams you can start, and exams you are taking." empty="Nothing open right now.">
          {data.available.map((e) => <Card key={e.id} e={e} serverNow={data.serverNow} />)}
        </Section>
        <Section title="Upcoming" hint="Published exams you are enrolled in that haven't opened yet. This page updates when they open." empty="No upcoming exams.">
          {data.upcoming.map((e) => <Card key={e.id} e={e} serverNow={data.serverNow} />)}
        </Section>
        <Section title="Completed" hint="Submitted or closed exams. Results appear here once your examiner publishes them." empty="No completed exams yet.">
          {data.completed.map((e) => <Card key={e.id} e={e} serverNow={data.serverNow} />)}
        </Section>
      </div>
    </CandidateShell>
  );
}

export default function MyExamsPage() {
  return <Suspense fallback={<ShellSkeleton />}><Content /></Suspense>;
}
