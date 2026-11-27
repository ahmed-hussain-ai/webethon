import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { eventBatchSchema, recordEvents } from "@/lib/monitoring/service";

// POST /api/my/attempts/:id/events { events:[{type, at?, details?}] }  (also the heartbeat)
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireRole("CANDIDATE", "EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Attempt");
  return ok(await recordEvents(user, id, await parseBody(req, eventBatchSchema)));
});
