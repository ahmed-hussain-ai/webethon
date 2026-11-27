import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { announcementsFor } from "@/lib/monitoring/service";

// GET /api/my/attempts/:id/announcements → examiner messages for this exam
export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const user = await requireRole("CANDIDATE", "EXAMINER", "ADMIN");
  return ok({ announcements: await announcementsFor(user, await idParam(ctx, "Attempt")) });
});
