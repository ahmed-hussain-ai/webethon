import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { startSandbox } from "@/lib/candidate/service";

// POST /api/exams/:id/preview → sandbox attempt for the examiner (never counted)
export const POST = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  return ok(await startSandbox(actor, await idParam(ctx, "Exam")), 201);
});
