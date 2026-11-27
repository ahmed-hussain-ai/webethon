import { Suspense } from "react";
import { ShellSkeleton, StaffShell } from "@/components/staff-shell";
import { ExamHeader } from "@/components/exams/exam-header";
import { ExamSettingsForm } from "@/components/exams/exam-settings-form";
import { requirePageRole } from "@/lib/auth/page-guards";
import { loadExamPage } from "./shared";

export const metadata = { title: "Exam settings · Examora" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole("EXAMINER", "ADMIN");
  const exam = await loadExamPage(user, (await params).id);
  return (
    <StaffShell user={user} active="exams">
      <ExamHeader exam={exam} tab="settings" />
      <ExamSettingsForm exam={exam} />
    </StaffShell>
  );
}

export default function ExamSettingsPage(props: PageProps<"/exams/[id]">) {
  return <Suspense fallback={<ShellSkeleton />}><Content params={props.params} /></Suspense>;
}
