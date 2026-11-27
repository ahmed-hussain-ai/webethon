import { handler, pdfResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { examReportPdf } from "@/lib/results/reports";

// GET /api/exams/:id/results/pdf → exam performance report (owner/admin)
export const GET = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const { bytes, filename } = await examReportPdf(actor, await idParam(ctx, "Exam"));
  return pdfResponse(bytes, filename);
});
