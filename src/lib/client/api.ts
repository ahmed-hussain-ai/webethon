// Browser-side helper for our JSON API. Never throws: returns either data or a normalised error.
export type ApiFailure = { code: string; message: string; fields?: Record<string, string> };
export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiFailure };

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "ADMIN" | "EXAMINER" | "CANDIDATE";
  mustChangePassword: boolean;
};

export async function postJson<T>(url: string, body?: unknown): Promise<ApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch {
    return {
      ok: false,
      error: { code: "NETWORK", message: "Can't reach the server. Check your internet connection and try again." },
    };
  }
  const json = await res.json().catch(() => null);
  if (res.ok) return { ok: true, data: json as T };
  return {
    ok: false,
    error: json?.error ?? { code: "HTTP_" + res.status, message: "Something went wrong. Please try again." },
  };
}

/** Turn zod issues into { field: firstMessage } for inline errors. */
export function zodFieldErrors(issues: { path: PropertyKey[]; message: string }[]) {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "_");
    out[k] ??= i.message;
  }
  return out;
}

export const homeFor = (u: Pick<SessionUser, "mustChangePassword">) =>
  u.mustChangePassword ? "/change-password" : "/dashboard";
