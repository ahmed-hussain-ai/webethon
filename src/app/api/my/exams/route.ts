import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { listMyExams } from "@/lib/candidate/service";

// GET /api/my/exams → { serverNow, available, upcoming, completed } for the logged-in candidate
export const GET = handler(async () => {
  const user = await requireRole("CANDIDATE");
  return ok(await listMyExams(user));
});
