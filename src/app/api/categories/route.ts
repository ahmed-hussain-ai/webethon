import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { categoryInputSchema } from "@/lib/validation/questions";
import { createCategory, listCategories } from "@/lib/questions/service";

// GET /api/categories → all categories with question counts (staff only)
export const GET = handler(async () => {
  await requireRole("EXAMINER", "ADMIN");
  return ok({ categories: await listCategories() });
});

// POST /api/categories { name, description? }
export const POST = handler(async (req) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const input = await parseBody(req, categoryInputSchema);
  return ok({ category: await createCategory(actor, input) }, 201);
});
