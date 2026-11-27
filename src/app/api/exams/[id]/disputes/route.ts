import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { examDisputes } from "@/lib/disputes/service";

// GET /api/exams/:id/disputes (owner/admin)
export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  return ok({ disputes: await examDisputes(actor, await idParam(ctx, "Exam")) });
});
