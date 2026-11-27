import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { startAttempt } from "@/lib/candidate/service";

// POST /api/my/exams/:id/start → { attemptId, resumed } (idempotent: repeat calls return the same attempt)
export const POST = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireRole("CANDIDATE");
  const result = await startAttempt(user, await idParam(ctx, "Exam"));
  return ok(result, result.resumed ? 200 : 201);
});
