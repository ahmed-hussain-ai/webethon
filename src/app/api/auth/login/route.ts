import { handler, ok, parseBody } from "@/lib/api";
import { loginSchema } from "@/lib/validation/auth";
import { login, publicUser } from "@/lib/auth/service";
import { createSession } from "@/lib/auth/session";
import { clientIp } from "@/lib/rate-limit";

// POST /api/auth/login  { email, password }
// Response tells the frontend the role (for redirect) and whether a password change is required.
export const POST = handler(async (req) => {
  const { email, password } = await parseBody(req, loginSchema);
  const user = await login(email, password, clientIp(req));
  await createSession(user.id, user.tokenVersion, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  return ok({ user: publicUser(user) });
});
