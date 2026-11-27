import { handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { updateUser, userUpdateSchema } from "@/lib/users/service";

// PATCH /api/users/:id { name?, role?, isActive? }  (admin only)
export const PATCH = handler<{ params: Promise<{ id: string }> }>(async (req, ctx) => {
  const actor = await requireRole("ADMIN");
  await updateUser(actor, await idParam(ctx, "User"), await parseBody(req, userUpdateSchema));
  return ok({ ok: true });
});
