import "server-only";
import { z } from "zod";
import { ApiError } from "@/lib/api";

/** Route id must be a UUID; anything else is simply "not found" (no DB call, no stack trace). */
export async function idParam(ctx: { params: Promise<{ id: string }> }, what = "Item") {
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) throw new ApiError(404, "NOT_FOUND", `${what} not found`);
  return id;
}
