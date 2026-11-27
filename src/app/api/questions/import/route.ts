import { z } from "zod";
import { ApiError, handler, ok, parseBody } from "@/lib/api";
import { requireRole } from "@/lib/auth/current-user";
import { analyseImport, commitImport, IMPORT_MAX_BYTES } from "@/lib/questions/import";

const bodySchema = z.object({
  format: z.enum(["csv", "json"], { error: "Format must be csv or json" }),
  content: z.string({ error: "File content is required" }),
  dryRun: z.boolean().default(true),
});

// POST /api/questions/import { format, content, dryRun }
//   dryRun=true  → per-row report, nothing saved
//   dryRun=false → imports only if there are ZERO errors (all-or-nothing)
export const POST = handler(async (req) => {
  const actor = await requireRole("EXAMINER", "ADMIN");
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > IMPORT_MAX_BYTES * 2) throw new ApiError(413, "FILE_TOO_LARGE", "File is larger than 1 MB. Split it into smaller files.");
  const { format, content, dryRun } = await parseBody(req, bodySchema);
  if (dryRun) {
    const { _valid, _byName, ...report } = await analyseImport(format, content);
    void _valid; void _byName;
    return ok(report);
  }
  return ok(await commitImport(actor, format, content), 201);
});
