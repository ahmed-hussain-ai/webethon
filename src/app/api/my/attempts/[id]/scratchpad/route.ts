import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { db } from "@/lib/db";
import { GRACE_MS } from "@/lib/attempts/workspace";

// PUT /api/my/attempts/:id/scratchpad { content }  rough work, own running attempt only (4.8)
export const PUT = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireUser();
  const id = await idParam(ctx, "Attempt");
  const { content } = await parseBody(req, z.object({ content: z.string().max(20000, "Scratchpad is full (20,000 characters)") }));
  const a = await db.attempt.findUnique({ where: { id }, select: { userId: true, status: true, deadlineAt: true } });
  if (!a || a.userId !== user.id) throw new ApiError(404, "NOT_FOUND", "Attempt not found");
  if (a.status !== "IN_PROGRESS" || Date.now() > a.deadlineAt.getTime() + GRACE_MS) throw new ApiError(409, "TIME_UP", "This attempt is finished.");
  await db.attempt.update({ where: { id }, data: { scratchpad: content } });
  return ok({ ok: true });
});
