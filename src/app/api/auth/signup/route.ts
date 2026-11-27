import { handler, ok, parseBody } from "@/lib/api";
import { signupSchema } from "@/lib/validation/auth";
import { publicUser, signupCandidate } from "@/lib/auth/service";
import { createSession } from "@/lib/auth/session";

// POST /api/auth/signup  { name, email, password } → creates a CANDIDATE and logs them in.
export const POST = handler(async (req) => {
  const input = await parseBody(req, signupSchema); // any "role" field is dropped here
  const user = await signupCandidate(input);
  await createSession(user.id, user.tokenVersion);
  return ok({ user: publicUser(user) }, 201);
});
