import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { getResults } from "@/lib/results/service";

// GET /api/exams/:id/results → per-candidate scores + summary statistics (owner/admin)
export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  return ok(await getResults(actor, await idParam(ctx, "Exam")));
});
