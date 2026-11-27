import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { examCreateSchema } from "@/lib/validation/exams";
import { createExam, listExams } from "@/lib/exams/service";

// GET /api/exams → my exams (admin: all)
export const GET = handler(async () => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  return ok({ exams: await listExams(actor) });
});

// POST /api/exams { title } → new DRAFT owned by the caller
export const POST = handler(async (req) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const { title } = await parseBody(req, examCreateSchema);
  return ok(await createExam(actor, title), 201);
});
