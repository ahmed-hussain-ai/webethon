import { handler, ok } from "@/lib/api";
import { deleteSession } from "@/lib/auth/session";

// POST /api/auth/logout  → clears this device's session (safe to call when already logged out).
export const POST = handler(async () => {
  await deleteSession();
  return ok({ ok: true });
});
