import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { monitor } from "@/lib/monitoring/service";

// GET /api/exams/:id/monitor → live attempts, incidents, announcements (owner/admin)
export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  return ok(await monitor(actor, await idParam(ctx, "Exam")));
});
