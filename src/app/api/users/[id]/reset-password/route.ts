import { handler, ok } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { idParam } from "@/lib/params";
import { resetPassword } from "@/lib/users/service";

// POST /api/users/:id/reset-password → { tempPassword } shown once (admin only)
export const POST = handler<{ params: Promise<{ id: string }> }>(async (_req, ctx) => {
  const actor = await requireRole("ADMIN");
  return ok(await resetPassword(actor, await idParam(ctx, "User")));
});
