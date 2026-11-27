import { ApiError, handler, ok } from "@/lib/api";
import { clientIp, hit } from "@/lib/rate-limit";
import { verifyCode } from "@/lib/results/reports";

// GET /api/verify/:code → PUBLIC. Masked name, exam, score, date, valid/superseded. Rate-limited.
export const GET = handler<{ params: Promise<{ code: string }> }>(async (req, ctx) => {
  const rl = hit(`verify:${clientIp(req)}`, 30, 60_000);
  if (!rl.ok) throw new ApiError(429, "RATE_LIMITED", "Too many checks. Wait a minute and try again.", undefined, { "Retry-After": String(rl.retryAfterSec) });
  const r = await verifyCode((await ctx.params).code);
  if (!r) throw new ApiError(404, "NOT_FOUND", "No report matches this code.");
  return ok({ report: r });
});
