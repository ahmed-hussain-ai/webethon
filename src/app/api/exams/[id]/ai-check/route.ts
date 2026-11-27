import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { runAiCheck } from "@/lib/results/service";

// POST /api/exams/:id/ai-check { attemptId? }  (whole exam when attemptId is omitted)
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  const { attemptId } = await parseBody(req, z.object({ attemptId: z.uuid().optional() }));
  return ok(await runAiCheck(actor, id, attemptId));
});
