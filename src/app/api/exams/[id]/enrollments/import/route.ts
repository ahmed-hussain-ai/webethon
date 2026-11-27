import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { candidateImportSchema } from "@/lib/validation/exams";
import { importCandidates } from "@/lib/exams/enrollment";

// POST /api/exams/:id/enrollments/import { content (CSV name,email), dryRun }
// Creates missing candidate accounts with unique temporary passwords (returned once) and enrolls everyone.
export const POST = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  const { content, dryRun } = await parseBody(req, candidateImportSchema);
  return ok(await importCandidates(actor, id, content, dryRun), dryRun ? 200 : 201);
});
