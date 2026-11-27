import Link from "next/link";
import { Suspense } from "react";
import { PageTitle, ShellSkeleton, StaffShell } from "@/components/staff-shell";
import { QuestionForm } from "@/components/questions/question-form";
import { requirePageRole } from "@/lib/auth/page-guards";
import { listCategories } from "@/lib/questions/service";

export const metadata = { title: "New question · Examora" };

async function Content() {
  const user = await requirePageRole("EXAMINER", "ADMIN");
  const categories = await listCategories();
  return (
    <StaffShell user={user} active="questions">
      <Link href="/questions" className="mb-4 inline-block text-sm font-semibold text-brand hover:underline">← Question bank</Link>
      <PageTitle eyebrow="Question bank" title="New question" />
      <QuestionForm categories={categories} />
    </StaffShell>
  );
}

export default function NewQuestionPage() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Content />
    </Suspense>
  );
}
