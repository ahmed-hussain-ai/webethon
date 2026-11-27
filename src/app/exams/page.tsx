import Link from "next/link";
import { Suspense } from "react";
import { PageTitle, ShellSkeleton, StaffShell } from "@/components/staff-shell";
import { NewExamForm } from "@/components/exams/new-exam-form";
import { PhaseBadge } from "@/components/exams/phase-badge";
import { LocalTime } from "@/components/local-time";
import { requirePageRole } from "@/lib/auth/page-guards";
import { listExams } from "@/lib/exams/service";

export const metadata = { title: "Exams · Examora" };

async function Content() {
  const user = await requirePageRole("EXAMINER", "ADMIN");
  const exams = await listExams(user);
  return (
    <StaffShell user={user} active="exams">
      <PageTitle eyebrow={user.role === "ADMIN" ? "All exams" : "Your exams"} title="Exams" actions={<NewExamForm />} />
      {exams.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <p className="font-display text-xl">No exams yet</p>
          <p className="mt-2 text-sm text-muted">Create a draft, add questions from the bank, enroll candidates, then publish.</p>
        </div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {exams.map((e) => (
            <li key={e.id}>
              <Link href={`/exams/${e.id}`} className="group block h-full rounded-3xl border border-line bg-surface p-5 transition hover:border-brand">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="font-display text-xl break-words group-hover:text-brand">{e.title}</h2>
                  <PhaseBadge phase={e.phase} />
                </div>
                <p className="mt-2 text-sm text-muted">
                  <LocalTime iso={e.startAt} fallback="No schedule yet" /> {e.endAt && <>→ <LocalTime iso={e.endAt} /></>}
                </p>
                <dl className="mt-4 flex flex-wrap gap-x-6 gap-y-2 font-mono text-sm">
                  <div><dt className="sr-only">Questions</dt><dd><strong>{e.questionCount}</strong> questions</dd></div>
                  <div><dt className="sr-only">Marks</dt><dd><strong>{e.totalMarks}</strong> marks</dd></div>
                  <div><dt className="sr-only">Duration</dt><dd><strong>{e.durationMinutes}</strong> min</dd></div>
                  <div><dt className="sr-only">Enrolled</dt><dd><strong>{e.enrolledCount}</strong> enrolled</dd></div>
                </dl>
                {user.role === "ADMIN" && <p className="mt-3 text-xs text-muted">Owner: {e.ownerName}</p>}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </StaffShell>
  );
}

export default function ExamsPage() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Content />
    </Suspense>
  );
}
