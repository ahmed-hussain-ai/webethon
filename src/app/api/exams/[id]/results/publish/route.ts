import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { publishResults } from "@/lib/results/service";

// POST /api/exams/:id/results/publish → only after the exam ended and every answer is marked
export const POST = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  await publishResults(actor, await idParam(ctx, "Exam"));
  return ok({ ok: true });
});
