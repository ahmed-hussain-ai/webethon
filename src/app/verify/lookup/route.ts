import { NextResponse } from "next/server";

// /verify/lookup?code=… → /verify/CODE (normalised)
export function GET(req: Request) {
  const code = (new URL(req.url).searchParams.get("code") ?? "").trim().toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20);
  return NextResponse.redirect(new URL(`/verify/${encodeURIComponent(code || "-")}`, req.url));
}
