import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_SECONDS = 8 * 60 * 60; // a full exam day

// The token carries ONLY the user id and token version. Role, name, active status are
// always re-read from the database on every request, never trusted from the token.
export type SessionPayload = { sub: string; tv: number };

function secretKey() {
  const s = process.env.AUTH_SECRET;
  if (!s || s.length < 32) throw new Error("AUTH_SECRET must be set and at least 32 characters");
  return new TextEncoder().encode(s);
}

export async function createSession(userId: string, tokenVersion: number) {
  const token = await new SignJWT({ tv: tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(secretKey());

  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true, // page scripts cannot read it
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax", // not sent on cross-site POSTs
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });
}

export async function readSession(): Promise<SessionPayload | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    if (typeof payload.sub !== "string" || typeof payload.tv !== "number") return null;
    return { sub: payload.sub, tv: payload.tv };
  } catch {
    return null; // expired, tampered or signed with another key
  }
}

export async function deleteSession() {
  (await cookies()).delete(SESSION_COOKIE);
}
