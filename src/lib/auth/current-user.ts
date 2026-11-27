import "server-only";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/client";
import { readSession } from "./session";
import { ApiError } from "@/lib/api";

export type CurrentUser = {
  id: string;
  name: string;
  email: string;
  role: Role;
  mustChangePassword: boolean;
  tokenVersion: number;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Who is logged in, based ONLY on the signed session cookie + the database.
 * Never on ids, emails or roles sent in the request body/query.
 * Returns null if: no cookie, bad/expired token, user gone, user deactivated,
 * or token_version changed (password changed, logged out everywhere, deactivated).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await readSession();
  if (!session || !UUID_RE.test(session.sub)) return null;

  const user = await db.user.findUnique({
    where: { id: session.sub },
    select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true, tokenVersion: true },
  });
  if (!user || !user.isActive || user.tokenVersion !== session.tv) return null;

  return { id: user.id, name: user.name, email: user.email, role: user.role, mustChangePassword: user.mustChangePassword, tokenVersion: user.tokenVersion };
}

/**
 * Require a logged-in user. Users with a temporary password are blocked from everything
 * except the few endpoints that pass { allowPendingPasswordChange: true }.
 */
export async function requireUser(opts: { allowPendingPasswordChange?: boolean } = {}): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Please log in");
  if (user.mustChangePassword && !opts.allowPendingPasswordChange) {
    throw new ApiError(403, "PASSWORD_CHANGE_REQUIRED", "You must change your temporary password first");
  }
  return user;
}

/** Require one of the given roles. The role comes from the database row, not the request. */
export async function requireRole(...roles: Role[]): Promise<CurrentUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) throw new ApiError(403, "FORBIDDEN", "You do not have permission to do this");
  return user;
}
