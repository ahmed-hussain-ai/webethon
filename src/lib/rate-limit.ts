import "server-only";

/**
 * Small in-memory fixed-window limiter (single server process; resets on restart).
 * Good enough for one deployed instance; swap for Redis if we ever run several.
 */
type Bucket = { count: number; resetAt: number };
const buckets = new Map<string, Bucket>();
const MAX_KEYS = 50_000; // memory cap: oldest keys are dropped first

export function hit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b || b.resetAt <= now) {
    b = { count: 0, resetAt: now + windowMs };
    buckets.delete(key);
    buckets.set(key, b);
    if (buckets.size > MAX_KEYS) buckets.delete(buckets.keys().next().value!);
  }
  b.count++;
  return { ok: b.count <= limit, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

/** Check a bucket without counting a hit. */
export function peek(key: string, limit: number): { ok: boolean; retryAfterSec: number } {
  const b = buckets.get(key);
  const now = Date.now();
  if (!b || b.resetAt <= now) return { ok: true, retryAfterSec: 0 };
  return { ok: b.count < limit, retryAfterSec: Math.max(1, Math.ceil((b.resetAt - now) / 1000)) };
}

export function clear(key: string) {
  buckets.delete(key);
}

/**
 * Client IP. Only trusts X-Forwarded-For when TRUST_PROXY=true (i.e. we run behind
 * nginx/Vercel that overwrites it); otherwise a client could fake the header to dodge limits.
 * With a trusted proxy we take the LAST entry: the address the proxy itself saw.
 */
export function clientIp(req: Request): string {
  if (process.env.TRUST_PROXY === "true") {
    const xff = req.headers.get("x-forwarded-for");
    if (xff) return xff.split(",").at(-1)!.trim();
    const real = req.headers.get("x-real-ip");
    if (real) return real.trim();
  }
  return "direct";
}
