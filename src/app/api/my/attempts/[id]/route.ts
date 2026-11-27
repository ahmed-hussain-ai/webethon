import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { getMyAttempt } from "@/lib/candidate/service";

// GET /api/my/attempts/:id → own attempt only (deadline from the server, no answer keys)
export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireRole("CANDIDATE");
  return ok({ attempt: await getMyAttempt(user, await idParam(ctx, "Attempt")) });
});
