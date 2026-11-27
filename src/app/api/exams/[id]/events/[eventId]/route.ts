import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam, uuidOr404 } from "@/lib/params";
import { reviewEvent } from "@/lib/monitoring/service";

// PUT /api/exams/:id/events/:eventId { status: NOTED|DISMISSED|UNREVIEWED, note? }
export const PUT = handler<{ params: Promise<{ id: string; eventId: string }> }>(async (req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  const body = await parseBody(req, z.object({ status: z.enum(["NOTED", "DISMISSED", "UNREVIEWED"]), note: z.string().trim().max(500).nullable().optional() }));
  await reviewEvent(actor, id, uuidOr404((await ctx.params).eventId, "Event"), body.status, body.note || null);
  return ok({ ok: true });
});
