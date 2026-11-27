import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { getLobby } from "@/lib/candidate/service";

// GET /api/my/exams/:id → lobby (404 unless published AND enrolled/attempted)
export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireRole("CANDIDATE");
  return ok({ exam: await getLobby(user, await idParam(ctx, "Exam")) });
});
