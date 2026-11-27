import "server-only";
import { db } from "@/lib/db";
import type { Role } from "@/generated/prisma/client";
import { readSession } from "./session";
import { ApiError } from "@/lib/api";

export type CurrentUser = {
  id: string;
  sessionId: string;
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
 * Returns null if: no cookie, bad/expired token, session revoked (logout) or expired,
 * user gone or deactivated, or token_version changed (password change / logout everywhere).
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const token = await readSession();
  if (!token || !UUID_RE.test(token.sid) || !UUID_RE.test(token.sub)) return null;

  const session = await db.session.findUnique({
    where: { id: token.sid },
    select: {
      userId: true, revokedAt: true, expiresAt: true,
      user: { select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true, tokenVersion: true } },
    },
  });
  if (!session || session.revokedAt || session.expiresAt <= new Date() || session.userId !== token.sub) return null;
  const user = session.user;
  if (!user.isActive || user.tokenVersion !== token.tv) return null;

  return {
    id: user.id, sessionId: token.sid, name: user.name, email: user.email, role: user.role,
    mustChangePassword: user.mustChangePassword, tokenVersion: user.tokenVersion,
  };
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
