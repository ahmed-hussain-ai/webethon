import { handler, ok, parseBody } from "@/lib/api";
import { signupSchema } from "@/lib/validation/auth";
import { publicUser, signupCandidate } from "@/lib/auth/service";
import { createSession } from "@/lib/auth/session";
import { clientIp } from "@/lib/rate-limit";

// POST /api/auth/signup  { name, email, password } → creates a CANDIDATE and logs them in.
export const POST = handler(async (req) => {
  const input = await parseBody(req, signupSchema); // any "role" field is dropped here
  const user = await signupCandidate(input, clientIp(req));
  await createSession(user.id, user.tokenVersion, { ip: clientIp(req), userAgent: req.headers.get("user-agent") });
  return ok({ user: publicUser(user) }, 201);
});
