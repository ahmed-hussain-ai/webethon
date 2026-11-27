import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { setQuestionActive } from "@/lib/questions/service";
import { idParam } from "@/lib/params";

// POST /api/questions/:id/deactivate → hidden from the exam builder; existing exams keep it
export const POST = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Question");
  await setQuestionActive(actor, id, false);
  return ok({ ok: true });
});
