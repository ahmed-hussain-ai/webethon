import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { answerBatchSchema, saveAnswers } from "@/lib/attempts/workspace";

// POST /api/my/attempts/:id/answers { answers:[{attemptQuestionId, selectedOptionIds, textAnswer, markedForReview, seq}] }
// Autosave. Newest seq wins per question; refused after the deadline (409 TIME_UP).
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireRole("CANDIDATE", "EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Attempt");
  return ok(await saveAnswers(user, id, await parseBody(req, answerBatchSchema)));
});
