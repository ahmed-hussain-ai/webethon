import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { examUpdateSchema } from "@/lib/validation/exams";
import { deleteExam, getExam, updateExamDetails } from "@/lib/exams/service";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/exams/:id (owner or admin)
export const GET = handler<Ctx>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  return ok({ exam: await getExam(actor, await idParam(ctx, "Exam")) });
});

// PUT /api/exams/:id  details + settings, with updatedAt (conflict-safe)
export const PUT = handler<Ctx>(async (req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  await updateExamDetails(actor, id, await parseBody(req, examUpdateSchema));
  return ok({ exam: await getExam(actor, id) });
});

// DELETE /api/exams/:id (drafts only)
export const DELETE = handler<Ctx>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  await deleteExam(actor, await idParam(ctx, "Exam"));
  return ok({ ok: true });
});
