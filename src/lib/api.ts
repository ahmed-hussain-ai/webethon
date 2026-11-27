import "server-only";
import { NextResponse } from "next/server";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";

/** Error with a stable machine code + human message. Every API error has this shape:
 *  { error: { code, message, fields? } } */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields?: Record<string, string>,
    public headers?: Record<string, string>,
  ) {
    super(message);
  }
}

// API responses can carry personal data or temporary passwords: never cache them anywhere.
const NO_STORE = { "Cache-Control": "no-store" };

export const ok = <T>(data: T, status = 200) => NextResponse.json(data, { status, headers: NO_STORE });

/** Parse a JSON body against a schema; bad JSON or invalid fields → 400 with per-field messages. */
export async function parseBody<S extends z.ZodType>(req: Request, schema: S): Promise<z.output<S>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    throw new ApiError(400, "VALIDATION_FAILED", "Please fix the highlighted fields", fields);
  }
  return result.data;
}

/** Block cross-site form posts: if the browser sends an Origin, it must match our host. */
export function assertSameOrigin(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin) return; // non-browser clients (curl, server-to-server)
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  try {
    if (new URL(origin).host === host) return;
  } catch {
    /* fallthrough */
  }
  throw new ApiError(403, "BAD_ORIGIN", "Cross-site request blocked");
}

/** Wrap a route handler: converts ApiError / validation / DB errors into clean JSON. */
export function handler<Ctx = unknown>(fn: (req: Request, ctx: Ctx) => Promise<Response>) {
  return async (req: Request, ctx: Ctx): Promise<Response> => {
    try {
      if (req.method !== "GET" && req.method !== "HEAD") assertSameOrigin(req);
      return await fn(req, ctx);
    } catch (e) {
      unstable_rethrow(e); // let Next.js handle its own internal signals (e.g. prerender bail-out)
      if (e instanceof ApiError) {
        return NextResponse.json(
          { error: { code: e.code, message: e.message, ...(e.fields ? { fields: e.fields } : {}) } },
          { status: e.status, headers: { ...NO_STORE, ...e.headers } },
        );
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json({ error: { code: "CONFLICT", message: "This record already exists" } }, { status: 409, headers: NO_STORE });
      }
      console.error(e);
      return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong" } }, { status: 500, headers: NO_STORE });
    }
  };
}
