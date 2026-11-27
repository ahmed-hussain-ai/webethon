import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // a full exam day

// The token carries the session id, user id and token version only. The session row must
// exist and not be revoked/expired; role, name and active status are always re-read from the DB.
export type SessionPayload = { sid: string; sub: string; tv: number };

const PLACEHOLDER_HINTS = ["change-me", "changeme", "example", "secret", "password"];

function secretKey() {
  const s = process.env.AUTH_SECRET ?? "";
  if (s.length < 32 || PLACEHOLDER_HINTS.some((h) => s.toLowerCase().includes(h))) {
    // Refuse to run with a missing, short or copy-pasted example secret:
    // anyone who knows it could forge a login for any account.
    throw new Error("AUTH_SECRET is missing or insecure. Generate one with: openssl rand -base64 48");
  }
  return new TextEncoder().encode(s);
}

export function assertAuthSecret() {
  secretKey();
}

export async function createSession(
  userId: string,
  tokenVersion: number,
  meta: { ip?: string; userAgent?: string | null } = {},
) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  const session = await db.session.create({
    data: { userId, expiresAt, ip: meta.ip?.slice(0, 64), userAgent: meta.userAgent?.slice(0, 300) },
  });
  // Housekeeping: drop this user's dead sessions.
  await db.session.deleteMany({
    where: { userId, OR: [{ expiresAt: { lt: new Date() } }, { revokedAt: { not: null } }] },
  });

  const token = await new SignJWT({ tv: tokenVersion, sid: session.id })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(secretKey());

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // page scripts cannot read it
    // HTTPS-only in production. COOKIE_SECURE="false" is only for serving over plain http
    // (e.g. a temporary IP:port deployment before a domain + certificate exist).
    secure: process.env.COOKIE_SECURE ? process.env.COOKIE_SECURE === "true" : process.env.NODE_ENV === "production",
    sameSite: "lax", // not sent on cross-site POSTs
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
  return session.id;
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.tv !== "number" || typeof payload.sid !== "string") return null;
    return { sid: payload.sid, sub: payload.sub, tv: payload.tv };
  } catch (e) {
    if (e instanceof Error && e.message.startsWith("AUTH_SECRET")) throw e;
    return null; // expired, tampered or signed with another key
  }
}

/** Logout: revoke this session server-side (so copies of the cookie die too), then clear it. */
export async function deleteSession() {
  const s = await readSession();
  if (s) {
    await db.session.updateMany({ where: { id: s.sid, revokedAt: null }, data: { revokedAt: new Date() } });
  }
  (await cookies()).delete(SESSION_COOKIE);
}
