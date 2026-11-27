import { z } from "zod";
import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { postAnnouncement } from "@/lib/monitoring/service";

// POST /api/exams/:id/announcements { message }
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  const { message } = await parseBody(req, z.object({ message: z.string().trim().min(1, "Write a message").max(500, "At most 500 characters") }));
  return ok(await postAnnouncement(actor, id, message), 201);
});
