import { Suspense } from "react";
import { ShellSkeleton, StaffShell } from "@/components/staff-shell";
import { ExamHeader } from "@/components/exams/exam-header";
import { CandidatesPanel } from "@/components/exams/candidates-panel";
import { requirePageRole } from "@/lib/auth/page-guards";
import { listEnrollments } from "@/lib/exams/enrollment";
import { loadExamPage } from "../shared";

export const metadata = { title: "Exam candidates · Examora" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole("EXAMINER", "ADMIN");
  const exam = await loadExamPage(user, (await params).id);
  const enrollments = await listEnrollments(user, exam.id);
  return (
    <StaffShell user={user} active="exams">
      <ExamHeader exam={exam} tab="candidates" />
      <CandidatesPanel examId={exam.id} enrollments={enrollments} open={exam.phase !== "COMPLETED"} />
    </StaffShell>
  );
}

export default function ExamCandidatesPage(props: PageProps<"/exams/[id]/candidates">) {
  return <Suspense fallback={<ShellSkeleton />}><Content params={props.params} /></Suspense>;
}
