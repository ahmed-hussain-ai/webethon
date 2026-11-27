import "server-only";
import { db } from "@/lib/db";
import { Prisma, type Role } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { burnPasswordCheck, generateTempPassword, hashPassword, verifyPassword } from "./password";
import type { CurrentUser } from "./current-user";

// Login cooldown: every 5 consecutive failures locks the account briefly.
// 5 min, then 10, 20, capped at 30. Kept SHORT on purpose: a long lock would let someone
// shut a candidate out of their exam just by typing wrong passwords for their email.
const FAILS_PER_LOCK = 5;
const BASE_LOCK_MIN = 5;
const MAX_LOCK_MIN = 30;

const INVALID_LOGIN = () => new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");

function lockedError(until: Date) {
  const secs = Math.max(1, Math.ceil((until.getTime() - Date.now()) / 1000));
  const mins = Math.ceil(secs / 60);
  return new ApiError(
    429, "ACCOUNT_LOCKED",
    `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    undefined, { "Retry-After": String(secs) },
  );
}

export const publicUser = (u: Pick<CurrentUser, "id" | "name" | "email" | "role" | "mustChangePassword">) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, mustChangePassword: u.mustChangePassword,
});

export async function login(email: string, password: string) {
  const user = await db.user.findUnique({ where: { email } });

  if (!user) {
    await burnPasswordCheck(password); // same response time as a wrong password
    throw INVALID_LOGIN();
  }
  // While locked, even the right password is refused (and not checked, so no oracle).
  if (user.lockedUntil && user.lockedUntil > new Date()) throw lockedError(user.lockedUntil);

  if (!(await verifyPassword(password, user.passwordHash))) {
    // Atomic increment: parallel wrong guesses can't skip the lock threshold.
    const updated = await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });
    const n = updated.failedLoginCount;
    if (n % FAILS_PER_LOCK === 0) {
      const mins = Math.min(MAX_LOCK_MIN, BASE_LOCK_MIN * 2 ** (n / FAILS_PER_LOCK - 1));
      const until = new Date(Date.now() + mins * 60_000);
      await db.user.update({ where: { id: user.id }, data: { lockedUntil: until } });
      throw lockedError(until);
    }
    throw INVALID_LOGIN();
  }

  // Only revealed after the correct password, so it doesn't leak which accounts exist.
  if (!user.isActive) {
    throw new ApiError(403, "ACCOUNT_DISABLED", "Your account has been deactivated. Contact your administrator.");
  }

  const fresh = await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
  });
  return fresh;
}

/** Public signup: ALWAYS a candidate, whatever the client sends. */
export async function signupCandidate(input: { name: string; email: string; password: string }) {
  if (process.env.ALLOW_PUBLIC_SIGNUP === "false") {
    throw new ApiError(403, "SIGNUP_DISABLED", "Public signup is disabled. Ask your examiner for an account.");
  }
  try {
    return await db.user.create({
      data: {
        name: input.name, email: input.email, role: "CANDIDATE",
        passwordHash: await hashPassword(input.password),
        preferences: { create: {} },
      },
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists", { email: "An account with this email already exists" });
    }
    throw e;
  }
}

/**
 * Account created by staff. Who may create what:
 *   ADMIN    → any role
 *   EXAMINER → CANDIDATE only
 * The server generates a unique random temporary password (returned ONCE) and forces a change at first login.
 */
export async function createUserByStaff(actor: CurrentUser, input: { name: string; email: string; role: Role }) {
  if (actor.role === "EXAMINER" && input.role !== "CANDIDATE") {
    throw new ApiError(403, "FORBIDDEN", "Examiners can only create candidate accounts");
  }
  if (actor.role === "CANDIDATE") throw new ApiError(403, "FORBIDDEN", "You do not have permission to do this");

  const tempPassword = generateTempPassword();
  try {
    const user = await db.user.create({
      data: {
        name: input.name, email: input.email, role: input.role,
        passwordHash: await hashPassword(tempPassword),
        mustChangePassword: true,
        preferences: { create: {} },
      },
    });
    return { user, tempPassword };
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      throw new ApiError(409, "EMAIL_TAKEN", "An account with this email already exists", { email: "An account with this email already exists" });
    }
    throw e;
  }
}

/**
 * Change own password. Bumps token_version so every OTHER session (other devices,
 * a stolen cookie) stops working; the caller re-issues a fresh session for this device.
 */
export async function changePassword(actor: CurrentUser, currentPassword: string, newPassword: string) {
  const user = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw new ApiError(400, "WRONG_PASSWORD", "Current password is incorrect", { currentPassword: "Current password is incorrect" });
  }
  // Only succeeds if nobody else changed the version in between (e.g. two tabs at once).
  const res = await db.user.updateMany({
    where: { id: user.id, tokenVersion: actor.tokenVersion },
    data: {
      passwordHash: await hashPassword(newPassword),
      mustChangePassword: false,
      tokenVersion: { increment: 1 },
    },
  });
  if (res.count === 0) throw new ApiError(409, "SESSION_CHANGED", "Your session changed, please log in again");
  return db.user.findUniqueOrThrow({ where: { id: user.id } });
}

/** Log out everywhere: invalidates all existing session tokens for this user. */
export async function revokeAllSessions(userId: string) {
  await db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
}
