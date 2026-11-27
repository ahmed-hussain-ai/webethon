import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { getExam, unpublishExam } from "@/lib/exams/service";

// POST /api/exams/:id/unpublish
export const POST = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  await unpublishExam(actor, id);
  return ok({ exam: await getExam(actor, id) });
});
