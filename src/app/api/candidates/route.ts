import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { searchCandidates } from "@/lib/exams/enrollment";

// GET /api/candidates?q=  → up to 20 active candidates (staff only, for enrolling)
export const GET = handler(async (req) => {
  await requireRole("EXAMINER", "ADMIN");
  return ok({ candidates: await searchCandidates(new URL(req.url).searchParams.get("q") ?? "") });
});
