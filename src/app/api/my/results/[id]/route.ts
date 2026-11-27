import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { getMyResult } from "@/lib/results/service";

// GET /api/my/results/:attemptId → own result, only once published
export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireRole("CANDIDATE");
  return ok({ result: await getMyResult(user, await idParam(ctx, "Result")) });
});
