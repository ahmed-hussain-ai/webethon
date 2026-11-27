import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { categoryInputSchema } from "@/lib/validation/questions";
import { deleteCategory, updateCategory } from "@/lib/questions/service";
import { idParam } from "@/lib/params";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/categories/:id { name, description? } (creator or admin)
export const PATCH = handler<Ctx>(async (req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const id = await idParam(ctx, "Category");
  const input = await parseBody(req, categoryInputSchema);
  return ok({ category: await updateCategory(actor, id, input) });
});

// DELETE /api/categories/:id (creator or admin, only when empty)
export const DELETE = handler<Ctx>(async (_req, ctx) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  await deleteCategory(actor, await idParam(ctx, "Category"));
  return ok({ ok: true });
});
