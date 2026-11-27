import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { myDisputes, raiseDispute, raiseSchema } from "@/lib/disputes/service";

// GET  /api/my/results/:attemptId/disputes → own disputes + whether more can be raised
// POST /api/my/results/:attemptId/disputes { attemptQuestionId?, category, description }
export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireRole("CANDIDATE");
  return ok(await myDisputes(user, await idParam(ctx, "Result")));
});
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireRole("CANDIDATE");
  const id = await idParam(ctx, "Result");
  return ok(await raiseDispute(user, id, await parseBody(req, raiseSchema)), 201);
});
