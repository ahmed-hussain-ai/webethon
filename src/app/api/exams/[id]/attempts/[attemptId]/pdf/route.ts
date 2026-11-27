import { handler, originOf, pdfResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam, uuidOr404 } from "@/lib/params";
import { candidateReportPdf } from "@/lib/results/reports";

// GET /api/exams/:id/attempts/:attemptId/pdf → a candidate's report (exam owner/admin, after publishing)
export const GET = handler<{ params: Promise<{ id: string; attemptId: string }> }>(async (req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  await idParam(ctx, "Exam");
  const { bytes, filename } = await candidateReportPdf(actor, uuidOr404((await ctx.params).attemptId, "Attempt"), originOf(req));
  return pdfResponse(bytes, filename);
});
