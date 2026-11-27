import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam, uuidOr404 } from "@/lib/params";
import { getAttemptForGrading, setMark } from "@/lib/results/service";

const schema = z.object({
  marks: z.number({ error: "Enter a mark" }).min(0, "Marks can't be negative").refine((m) => Math.abs(m * 100 - Math.round(m * 100)) < 1e-9, "At most 2 decimal places").nullable(),
  feedback: z.string().trim().max(2000, "Feedback is too long (max 2000 characters)").nullable().optional().transform((v) => v || null),
});

// PUT /api/exams/:id/attempts/:attemptId/answers/:answerId { marks (null = clear override), feedback }
export const PUT = handler<{ params: Promise<{ id: string; attemptId: string; answerId: string }> }>(async (req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  const p = await ctx.params;
  const attemptId = uuidOr404(p.attemptId, "Attempt");
  const body = await parseBody(req, schema);
  await setMark(actor, id, attemptId, uuidOr404(p.answerId, "Answer"), { marks: body.marks, feedback: body.feedback ?? null });
  return ok({ attempt: await getAttemptForGrading(actor, id, attemptId) });
});
