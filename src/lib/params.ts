import "server-only";
import { z } from "zod";
import { notFound } from "next/navigation";
import { ApiError } from "@/lib/api";

/** Route id must be a UUID; anything else is simply "not found" (no DB call, no stack trace). */
export async function idParam(ctx: { params: Promise<{ id: string }> }, what = "Item") {
  const { id } = await ctx.params;
  return uuidOr404(id, what);
}

export function uuidOr404(value: string, what = "Item") {
  if (!z.uuid().safeParse(value).success) throw new ApiError(404, "NOT_FOUND", `${what} not found`);
  return value;
}

/** For pages: a malformed id renders the 404 page instead of a server error. */
export function pageUuid(value: string) {
  if (!z.uuid().safeParse(value).success) notFound();
  return value;
}
