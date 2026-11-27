import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PageTitle, ShellSkeleton, StaffShell } from "@/components/staff-shell";
import { DifficultyBadge, InactiveBadge, LockBadge, TypeBadge } from "@/components/badges";
import { QuestionForm } from "@/components/questions/question-form";
import { QuestionActions } from "@/components/questions/question-actions";
import { FormAlert } from "@/components/ui";
import { requirePageRole } from "@/lib/auth/page-guards";
import { getQuestion, listCategories } from "@/lib/questions/service";
import { ApiError } from "@/lib/api";

export const metadata = { title: "Question · SecureExam" };

async function Content({ params, searchParams }: PageProps<"/questions/[id]">) {
  const user = await requirePageRole("EXAMINER", "ADMIN");
  const { id } = await params;
  const sp = await searchParams;
  const q = await getQuestion(user, id).catch((e) => {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  });
  const categories = await listCategories();
  const readOnly = !q.canEdit || q.locked;

  return (
    <StaffShell user={user} active="questions">
      <Link href="/questions" className="mb-4 inline-block text-sm font-semibold text-brand hover:underline">← Question bank</Link>
      <PageTitle
        eyebrow={`${q.category.name} · by ${q.createdByName}`}
        title={readOnly ? "View question" : "Edit question"}
        actions={<QuestionActions id={q.id} isActive={q.isActive} canEdit={q.canEdit} />}
      />
      <div className="mb-5 flex flex-wrap items-center gap-2">
        <TypeBadge type={q.type} />
        <DifficultyBadge difficulty={q.difficulty} />
        {q.locked && <LockBadge />}
        {!q.isActive && <InactiveBadge />}
        <span className="text-xs text-muted">
          {q.usedIn > 0 ? `Used in ${q.usedIn} exam${q.usedIn === 1 ? "" : "s"}` : "Not used in any exam yet"}
        </span>
      </div>
      <div className="mb-5 space-y-3">
        {sp.saved && <FormAlert tone="notice">Saved.</FormAlert>}
        {sp.copied && <FormAlert tone="notice">This is your editable copy. Change it and save.</FormAlert>}
        {q.locked && (
          <FormAlert tone="notice">
            This question is used in a published exam, so it is locked to keep every candidate&apos;s paper identical.
            Use <strong>Duplicate</strong> to make an editable copy.
          </FormAlert>
        )}
        {!q.canEdit && !q.locked && (
          <FormAlert tone="notice">Only {q.createdByName} or an admin can edit this question. You can still use it in exams or duplicate it.</FormAlert>
        )}
        {!q.isActive && <FormAlert tone="notice">Inactive: hidden from the exam builder. Exams that already use it are unaffected.</FormAlert>}
      </div>
      <QuestionForm
        categories={categories}
        readOnly={readOnly}
        typeLocked={q.usedIn > 0}
        initial={{
          id: q.id, type: q.type, categoryId: q.category.id, difficulty: q.difficulty, marks: q.marks, text: q.text,
          modelAnswer: q.modelAnswer, explanation: q.explanation, options: q.options, updatedAt: q.updatedAt,
        }}
      />
    </StaffShell>
  );
}

export default function QuestionPage(props: PageProps<"/questions/[id]">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Content {...props} />
    </Suspense>
  );
}
