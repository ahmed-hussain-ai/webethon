import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam, uuidOr404 } from "@/lib/params";
import { resolveDispute, resolveSchema } from "@/lib/disputes/service";

// PUT /api/exams/:id/disputes/:disputeId { decision: UNDER_REVIEW | REJECT{note} | ACCEPT{note, marks?, applyToAll?} }
export const PUT = handler<{ params: Promise<{ id: string; disputeId: string }> }>(async (req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  await resolveDispute(actor, id, uuidOr404((await ctx.params).disputeId, "Dispute"), await parseBody(req, resolveSchema));
  return ok({ ok: true });
});
