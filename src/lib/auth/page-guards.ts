import "server-only";
import { redirect } from "next/navigation";
import { getCurrentUser, type CurrentUser } from "./current-user";
import type { Role } from "@/generated/prisma/client";

// Page-level checks. Same source of truth as the API: session cookie + database row.
// Must be called inside a <Suspense> boundary (they read cookies at request time).

/** For /login and /signup: an already-logged-in user is sent to their page. */
export async function redirectIfLoggedIn(): Promise<null> {
  const user = await getCurrentUser();
  if (user) redirect(user.mustChangePassword ? "/change-password" : "/dashboard");
  return null;
}

/** For protected pages. A pending temporary password forces /change-password first. */
export async function requirePageUser(opts: { allowPendingPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.mustChangePassword && !opts.allowPendingPasswordChange) redirect("/change-password");
  return user;
}

/** For staff-only pages: wrong role → back to their dashboard (the API enforces this too). */
export async function requirePageRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requirePageUser();
  if (!roles.includes(user.role)) redirect("/dashboard");
  return user;
}
