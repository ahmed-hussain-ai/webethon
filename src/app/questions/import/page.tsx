import { Suspense } from "react";
import { PageTitle, ShellSkeleton, StaffShell } from "@/components/staff-shell";
import { ImportWizard } from "@/components/questions/import-wizard";
import { requirePageRole } from "@/lib/auth/page-guards";

export const metadata = { title: "Import questions · SecureExam" };

async function Content() {
  const user = await requirePageRole("EXAMINER", "ADMIN");
  return (
    <StaffShell user={user} active="import">
      <PageTitle eyebrow="Question bank" title="Import questions" />
      <ImportWizard />
    </StaffShell>
  );
}

export default function ImportPage() {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Content />
    </Suspense>
  );
}
