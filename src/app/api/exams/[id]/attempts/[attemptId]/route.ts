import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam, uuidOr404 } from "@/lib/params";
import { getAttemptForGrading } from "@/lib/results/service";

// GET /api/exams/:id/attempts/:attemptId → full attempt for marking (owner/admin)
export const GET = handler<{ params: Promise<{ id: string; attemptId: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  return ok({ attempt: await getAttemptForGrading(actor, id, uuidOr404((await ctx.params).attemptId, "Attempt")) });
});
