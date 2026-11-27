import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { getExam, publishExam } from "@/lib/exams/service";

// POST /api/exams/:id/publish
export const POST = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  await publishExam(actor, id);
  return ok({ exam: await getExam(actor, id) });
});
