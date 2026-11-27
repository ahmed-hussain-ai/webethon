import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { questionInputSchema, questionListQuerySchema } from "@/lib/validation/questions";
import { createQuestion, listQuestions } from "@/lib/questions/service";

// GET /api/questions?q=&category=&type=&difficulty=&status=active|inactive|all&mine=1&page=
// Staff only: the bank contains answer keys and must never reach candidates.
export const GET = handler(async (req) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const query = questionListQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  return ok(await listQuestions(actor, query));
});

// POST /api/questions  (any examiner/admin; they become the owner)
export const POST = handler(async (req) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const input = await parseBody(req, questionInputSchema);
  return ok(await createQuestion(actor, input), 201);
});
