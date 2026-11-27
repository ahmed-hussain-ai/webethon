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

// Business-rule errors raised by our DB triggers start with a stable code.
const DB_RULES: Record<string, number> = {
  INVALID_OPTIONS: 400, INVALID_MARKS: 400, NOT_A_CANDIDATE: 400,
  QUESTION_LOCKED: 409, QUESTION_INACTIVE: 409, EXAM_LOCKED: 409, PUBLISH_BLOCKED: 409,
  RESULTS_TOO_EARLY: 409, LAST_ADMIN: 409, ROLE_IN_USE: 409, FORBIDDEN: 403,
};
const FRIENDLY: Record<string, string> = {
  QUESTION_LOCKED: "This question is used in a published exam, so it can't be changed. Duplicate it to make an edited copy.",
};

/** Turn a DB trigger exception into an ApiError (or null if it isn't one of ours). */
export function dbRuleError(e: unknown): ApiError | null {
  const text = e instanceof Error ? `${e.message} ${JSON.stringify((e as { meta?: unknown }).meta ?? "")}` : "";
  const m = text.match(/\b([A-Z_]{5,}): ([^"`\n]+)/);
  if (!m || !(m[1] in DB_RULES)) return null;
  const msg = m[2].trim();
  return new ApiError(DB_RULES[m[1]], m[1], FRIENDLY[m[1]] ?? msg.charAt(0).toUpperCase() + msg.slice(1));
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
      const rule = dbRuleError(e);
      if (rule) {
        return NextResponse.json({ error: { code: rule.code, message: rule.message } }, { status: rule.status, headers: NO_STORE });
      }
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        return NextResponse.json({ error: { code: "CONFLICT", message: "This record already exists" } }, { status: 409, headers: NO_STORE });
      }
      console.error(e);
      return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong" } }, { status: 500, headers: NO_STORE });
    }
  };
}
