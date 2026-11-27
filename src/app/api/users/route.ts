import { handler, ok, parseBody } from "@/lib/api";
import { createUserSchema } from "@/lib/validation/auth";
import { requireRole } from "@/lib/auth/current-user";
import { createUserByStaff, publicUser } from "@/lib/auth/service";

// POST /api/users  { name, email, role }  (ADMIN: any role; EXAMINER: CANDIDATE only)
// Returns a unique temporary password ONCE; the user must change it at first login.
export const POST = handler(async (req) => {
  const actor = await requireRole("ADMIN", "EXAMINER");
  const input = await parseBody(req, createUserSchema);
  const { user, tempPassword } = await createUserByStaff(actor, input);
  return ok({ user: publicUser(user), tempPassword }, 201);
});
