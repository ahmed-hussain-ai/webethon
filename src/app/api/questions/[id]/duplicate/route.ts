import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { duplicateQuestion } from "@/lib/questions/service";
import { idParam } from "@/lib/params";

// POST /api/questions/:id/duplicate → editable copy owned by the caller
export const POST = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Question");
  return ok(await duplicateQuestion(actor, id), 201);
});
