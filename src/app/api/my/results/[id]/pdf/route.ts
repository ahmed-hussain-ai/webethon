import { handler, originOf, pdfResponse } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { candidateReportPdf } from "@/lib/results/reports";

// GET /api/my/results/:attemptId/pdf → own result report (after publishing) with verification code
export const GET = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const user = await requireRole("CANDIDATE");
  const { bytes, filename } = await candidateReportPdf(user, await idParam(ctx, "Report"), originOf(req));
  return pdfResponse(bytes, filename);
});
