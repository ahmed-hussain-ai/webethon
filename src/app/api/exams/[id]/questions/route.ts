import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { examQuestionsSchema } from "@/lib/validation/exams";
import { getExam, setExamQuestions } from "@/lib/exams/service";

// PUT /api/exams/:id/questions { updatedAt, items:[{questionId, marks, negativeMarks}] }  (order = array order)
export const PUT = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  await setExamQuestions(actor, id, await parseBody(req, examQuestionsSchema));
  return ok({ exam: await getExam(actor, id) });
});
