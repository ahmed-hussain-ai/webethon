import { z } from "zod";
import { ApiError, handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { revokeEnrollment } from "@/lib/exams/enrollment";

// DELETE /api/exams/:id/enrollments/:enrollmentId → revoke (kept for history, can be re-enrolled)
export const DELETE = handler<{ params: Promise<{ id: string; enrollmentId: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  const { enrollmentId } = await ctx.params;
  if (!z.uuid().safeParse(enrollmentId).success) throw new ApiError(404, "NOT_FOUND", "Enrollment not found");
  await revokeEnrollment(actor, id, enrollmentId);
  return ok({ ok: true });
});
