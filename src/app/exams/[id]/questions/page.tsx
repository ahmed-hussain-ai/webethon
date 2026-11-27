import { Suspense } from "react";
import { ShellSkeleton, StaffShell } from "@/components/staff-shell";
import { ExamHeader } from "@/components/exams/exam-header";
import { QuestionBuilder } from "@/components/exams/question-builder";
import { requirePageRole } from "@/lib/auth/page-guards";
import { listCategories } from "@/lib/questions/service";
import { loadExamPage } from "../shared";

export const metadata = { title: "Exam questions · Examora" };

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole("EXAMINER", "ADMIN");
  const exam = await loadExamPage(user, (await params).id);
  const categories = (await listCategories()).map((c) => ({ id: c.id, name: c.name }));
  return (
    <StaffShell user={user} active="exams">
      <ExamHeader exam={exam} tab="questions" />
      <QuestionBuilder exam={exam} categories={categories} />
    </StaffShell>
  );
}

export default function ExamQuestionsPage(props: PageProps<"/exams/[id]/questions">) {
  return <Suspense fallback={<ShellSkeleton />}><Content params={props.params} /></Suspense>;
}
