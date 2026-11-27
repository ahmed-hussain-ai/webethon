import { handler, ok, parseBody } from "@/lib/api";
import { createUserSchema } from "@/lib/validation/auth";
import { requireRole } from "@/lib/auth/current-user";
import { createUserByStaff, publicUser } from "@/lib/auth/service";
import { listUsers, userListSchema } from "@/lib/users/service";

// POST /api/users  { name, email, role }  (ADMIN: any role; EXAMINER: CANDIDATE only)
// Returns a unique temporary password ONCE; the user must change it at first login.
export const POST = handler(async (req) => {
  const actor = await requireRole("ADMIN", "EXAMINER");
  const input = await parseBody(req, createUserSchema);
  const { user, tempPassword } = await createUserByStaff(actor, input);
  return ok({ user: publicUser(user), tempPassword }, 201);
});

// GET /api/users?q=&role=&status=&page=  (admin only)
export const GET = handler(async (req) => {
  await requireRole("ADMIN");
  return ok(await listUsers(userListSchema.parse(Object.fromEntries(new URL(req.url).searchParams))));
});
