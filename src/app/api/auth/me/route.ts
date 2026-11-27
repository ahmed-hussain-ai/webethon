import { handler, ok } from "@/lib/api";
import { requireUser } from "@/lib/auth/current-user";
import { publicUser } from "@/lib/auth/service";

// GET /api/auth/me  → the logged-in user, from session cookie + database (401 if none).
export const GET = handler(async () => {
  const user = await requireUser({ allowPendingPasswordChange: true });
  return ok({ user: publicUser(user) });
});
