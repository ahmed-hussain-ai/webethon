import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/current-user";
import { revokeAllSessions } from "@/lib/auth/service";
import { deleteSession } from "@/lib/auth/session";

// POST /api/auth/logout-all  → every session of this user, on every device, stops working.
export const POST = handler(async () => {
  const user = await requireUser({ allowPendingPasswordChange: true });
  await revokeAllSessions(user.id);
  await deleteSession();
  return ok({ ok: true });
});
