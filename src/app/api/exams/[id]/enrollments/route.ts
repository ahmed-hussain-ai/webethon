import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { enrollEmailsSchema } from "@/lib/validation/exams";
import { enrollByEmails, listEnrollments } from "@/lib/exams/enrollment";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/exams/:id/enrollments
export const GET = handler<Ctx>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  return ok({ enrollments: await listEnrollments(actor, await idParam(ctx, "Exam")) });
});

// POST /api/exams/:id/enrollments { emails: [...] }  enroll existing candidate accounts
export const POST = handler<Ctx>(async (req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Exam");
  const { emails } = await parseBody(req, enrollEmailsSchema);
  return ok(await enrollByEmails(actor, id, emails));
});
