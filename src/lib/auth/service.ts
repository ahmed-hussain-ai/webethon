import "server-only";
import { db } from "@/lib/db";
import { Prisma, type Role } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import { burnPasswordCheck, generateTempPassword, hashPassword, verifyPassword } from "./password";
import type { CurrentUser } from "./current-user";
import { hit, peek } from "@/lib/rate-limit";

// Per-account cooldown: every 5 consecutive failures locks the account briefly:
// 5 min, then 10, 20, capped at 30. Kept SHORT on purpose: a long lock would let someone
// shut a candidate out of their exam just by typing wrong passwords for their email.
const FAILS_PER_LOCK = 5;
const LOCK_WINDOW_MS = 5 * 60_000;

// Per-IP limits. Only FAILED logins count, so a whole exam lab behind one IP can still
// sign in at once; a password-spraying client gets cut off.
const IP_LOGIN_FAILS = { limit: 50, windowMs: 10 * 60_000 };
const IP_SIGNUPS = { limit: 20, windowMs: 10 * 60_000 };

const INVALID_LOGIN = () => new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");

function lockedError(retryAfterSec: number) {
  const secs = Math.max(1, Math.ceil(retryAfterSec));
  const mins = Math.ceil(secs / 60);
  return new ApiError(
    429, "ACCOUNT_LOCKED",
    `Too many failed attempts. Try again in ${mins} minute${mins === 1 ? "" : "s"}.`,
    undefined, { "Retry-After": String(secs) },
  );
}
const secsUntil = (d: Date) => (d.getTime() - Date.now()) / 1000;

function tooManyFromIp(retryAfterSec: number) {
  return new ApiError(
    429, "RATE_LIMITED", "Too many attempts from this network. Please wait a few minutes and try again.",
    undefined, { "Retry-After": String(retryAfterSec) },
  );
}

export const publicUser = (u: Pick<CurrentUser, "id" | "name" | "email" | "role" | "mustChangePassword">) => ({
  id: u.id, name: u.name, email: u.email, role: u.role, mustChangePassword: u.mustChangePassword,
});

/**
 * Reserve one login attempt ATOMICALLY. A single UPDATE both counts the attempt and sets
 * the lock on the 5th; Postgres row locking makes parallel requests queue up, and once the
 * lock is set the WHERE clause rejects the rest. So at most 5 guesses get checked, even if
 * an attacker fires 100 requests at the same instant. Returns null when the account is locked.
 */
async function reserveAttempt(userId: string) {
  const rows = await db.$queryRaw<{ failed_login_count: number; locked_until: Date | null }[]>`
    UPDATE users
       SET failed_login_count = failed_login_count + 1,
           locked_until = CASE WHEN (failed_login_count + 1) % ${FAILS_PER_LOCK} = 0
             THEN now() + make_interval(mins => LEAST(30, 5 * power(2, (failed_login_count + 1) / ${FAILS_PER_LOCK} - 1))::int)
             ELSE locked_until END
     WHERE id = ${userId}::uuid AND (locked_until IS NULL OR locked_until <= now())
 RETURNING failed_login_count, locked_until`;
  return rows[0] ?? null;
}

export async function login(email: string, password: string, ip: string) {
  const ipKey = `login-fail:${ip}`;
  const ipState = peek(ipKey, IP_LOGIN_FAILS.limit);
  if (!ipState.ok) throw tooManyFromIp(ipState.retryAfterSec);

  const user = await db.user.findUnique({ where: { email } });

  if (!user) {
    await burnPasswordCheck(password); // same response time as a wrong password
    hit(ipKey, IP_LOGIN_FAILS.limit, IP_LOGIN_FAILS.windowMs);
    // Unknown emails get locked after 5 tries too, exactly like real ones,
    // so the lockout can't be used to discover which emails are registered.
    const fake = hit(`login-unknown:${email}`, FAILS_PER_LOCK - 1, LOCK_WINDOW_MS);
    if (!fake.ok) throw lockedError(fake.retryAfterSec);
    throw INVALID_LOGIN();
  }

  const attempt = await reserveAttempt(user.id);
  if (!attempt) {
    // Locked: refused without checking the password (no oracle while locked).
    const fresh = await db.user.findUnique({ where: { id: user.id }, select: { lockedUntil: true } });
    throw lockedError(fresh?.lockedUntil ? secsUntil(fresh.lockedUntil) : LOCK_WINDOW_MS / 1000);
  }

  if (!(await verifyPassword(password, user.passwordHash))) {
    hit(ipKey, IP_LOGIN_FAILS.limit, IP_LOGIN_FAILS.windowMs);
    if (attempt.locked_until && attempt.failed_login_count % FAILS_PER_LOCK === 0) {
      throw lockedError(secsUntil(attempt.locked_until));
    }
    throw INVALID_LOGIN();
  }

  // Correct password: clear the counter (the reserved attempt is undone).
  const fresh = await db.user.update({
    where: { id: user.id },
    data: { failedLoginCount: 0, lockedUntil: null, ...(user.isActive ? { lastLoginAt: new Date() } : {}) },
  });

  // Only revealed after the correct password, so it doesn't leak which accounts exist.
  if (!fresh.isActive) {
    throw new ApiError(403, "ACCOUNT_DISABLED", "Your account has been deactivated. Contact your administrator.");
  }
  return fresh;
}

/** Public signup: ALWAYS a candidate, whatever the client sends. */
export async function signupCandidate(input: { name: string; email: string; password: string }, ip: string) {
  if (process.env.ALLOW_PUBLIC_SIGNUP === "false") {
    throw new ApiError(403, "SIGNUP_DISABLED", "Public signup is disabled. Ask your examiner for an account.");
  }
  // Stops bots from mass-creating accounts.
  const rl = hit(`signup:${ip}`, IP_SIGNUPS.limit, IP_SIGNUPS.windowMs);
  if (!rl.ok) throw tooManyFromIp(rl.retryAfterSec);
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
  await db.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } });
  return db.user.findUniqueOrThrow({ where: { id: user.id } });
}

/** Log out everywhere: invalidates all existing session tokens for this user. */
export async function revokeAllSessions(userId: string) {
  await db.$transaction([
    db.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } }),
    db.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}
