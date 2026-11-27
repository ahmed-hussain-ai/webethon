import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { getPaper } from "@/lib/attempts/workspace";

// GET /api/my/attempts/:id/paper → frozen paper + saved answers (no answer keys)
export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireRole("CANDIDATE");
  return ok({ paper: await getPaper(user, await idParam(ctx, "Attempt")) });
});
