import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { questionUpdateSchema } from "@/lib/validation/questions";
import { getQuestion, updateQuestion } from "@/lib/questions/service";
import { idParam } from "@/lib/params";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/questions/:id (with options + correct flags: staff only)
export const GET = handler<Ctx>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  return ok({ question: await getQuestion(actor, await idParam(ctx, "Question")) });
});

// PUT /api/questions/:id  full replacement + updatedAt (creator or admin; blocked when locked)
export const PUT = handler<Ctx>(async (req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Question");
  const input = await parseBody(req, questionUpdateSchema);
  return ok(await updateQuestion(actor, id, input));
});
