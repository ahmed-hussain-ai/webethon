import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { questionAnalytics } from "@/lib/results/service";

// GET /api/exams/:id/analytics → per-question performance (sandbox attempts excluded)
export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  return ok({ questions: await questionAnalytics(actor, await idParam(ctx, "Exam")) });
});
