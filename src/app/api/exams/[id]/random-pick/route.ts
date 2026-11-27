import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { randomPickSchema } from "@/lib/validation/exams";
import { randomPick } from "@/lib/exams/service";

// POST /api/exams/:id/random-pick { rules:[{categoryId?, difficulty?, type?, count}], excludeIds }
// Returns questions to add; nothing is saved until the builder saves the list.
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  return ok({ questions: await randomPick(actor, id, await parseBody(req, randomPickSchema)) });
});
