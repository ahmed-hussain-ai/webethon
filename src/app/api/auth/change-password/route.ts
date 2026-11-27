import { handler, ok, parseBody } from "@/lib/api";
import { changePasswordSchema } from "@/lib/validation/auth";
import { requireUser } from "@/lib/auth/current-user";
import { changePassword, publicUser } from "@/lib/auth/service";
import { createSession } from "@/lib/auth/session";
import { clientIp } from "@/lib/rate-limit";

// POST /api/auth/change-password  { currentPassword, newPassword }
// Allowed while a temporary password is pending (that's the point). Other sessions are logged out.
export const POST = handler(async (req) => {
  const actor = await requireUser({ allowPendingPasswordChange: true });
  const { currentPassword, newPassword } = await parseBody(req, changePasswordSchema);
  const user = await changePassword(actor, currentPassword, newPassword);
  await createSession(user.id, user.tokenVersion, { ip: clientIp(req), userAgent: req.headers.get("user-agent") }); // keep THIS device logged in
  return ok({ user: publicUser(user) });
});
