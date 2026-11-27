import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { answerBatchSchema, submitAttempt } from "@/lib/attempts/workspace";

// POST /api/my/attempts/:id/submit { answers: [...final unsaved changes] }  (idempotent)
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireRole("CANDIDATE");
  const id = await idParam(ctx, "Attempt");
  return ok(await submitAttempt(user, id, await parseBody(req, answerBatchSchema)));
});
