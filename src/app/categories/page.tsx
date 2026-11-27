import { Suspense } from "react";
import { PageTitle, ShellSkeleton, StaffShell } from "@/components/staff-shell";
import { CategoryManager } from "@/components/questions/category-manager";
import { requirePageRole } from "@/lib/auth/page-guards";
import { listCategories } from "@/lib/questions/service";

export const metadata = { title: "Categories · SecureExam" };

async function Content() {
  const user = await requirePageRole("EXAMINER", "ADMIN");
  const cats = await listCategories();
  return (
    <StaffShell user={user} active="categories">
      <PageTitle eyebrow="Question bank" title="Categories" />
      <CategoryManager
        categories={cats.map((c) => ({
          id: c.id, name: c.name, description: c.description, createdByName: c.createdByName, questionCount: c.questionCount,
          canManage: user.role === "ADMIN" || user.id === c.createdById,
        }))}
      />
    </StaffShell>
  );
}

export default function CategoriesPage() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Content />
    </Suspense>
  );
}
