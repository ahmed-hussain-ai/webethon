import { Suspense } from "react";
import { ShellSkeleton, StaffShell } from "@/components/staff-shell";
import { ExamHeader } from "@/components/exams/exam-header";
import { ResolveDispute } from "@/components/disputes/resolve-dispute";
import { requirePageRole } from "@/lib/auth/page-guards";
import { examDisputes } from "@/lib/disputes/service";
import { loadExamPage } from "../shared";

export const metadata = { title: "Disputes · SecureExam" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole("EXAMINER", "ADMIN");
  const exam = await loadExamPage(user, (await params).id);
  const list = await examDisputes(user, exam.id);
  const open = list.filter((d) => d.status === "OPEN" || d.status === "UNDER_REVIEW");
  const closed = list.filter((d) => !open.includes(d));
  return (
    <StaffShell user={user} active="exams">
      <ExamHeader exam={exam} tab="disputes" />
      <p className="mb-5 text-sm text-muted">
        Every decision needs a written response, which the candidate sees. Accepted changes update the score, are recorded in the audit log,
        and make the candidate&apos;s old report code show as superseded.
      </p>
      <div className="space-y-4">
        {open.length === 0 && <p className="rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-10 text-center text-sm text-muted">No open disputes.</p>}
        {open.map((d) => <ResolveDispute key={d.id} examId={exam.id} d={d} />)}
        {closed.length > 0 && <h2 className="eyebrow pt-4 text-muted">Resolved</h2>}
        {closed.map((d) => <ResolveDispute key={d.id} examId={exam.id} d={d} />)}
      </div>
    </StaffShell>
  );
}

export default function DisputesPage(props: PageProps<"/exams/[id]/disputes">) {
  return <Suspense fallback={<ShellSkeleton />}><Content params={props.params} /></Suspense>;
}
