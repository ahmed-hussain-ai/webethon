"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};
/** True only in the browser after hydration (avoids server/client timezone mismatches). */
export const useMounted = () => useSyncExternalStore(noop, () => true, () => false);

const fmt = (iso: string, withYear: boolean) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}),
    hour: "numeric", minute: "2-digit",
  });

/** Date/time in the VIEWER's timezone. The server renders a neutral placeholder. */
export function LocalTime({ iso, fallback = "Not set", withYear = false }: { iso: string | null; fallback?: string; withYear?: boolean }) {
  const mounted = useMounted();
  if (!iso) return <span className="text-muted">{fallback}</span>;
  return <time dateTime={iso}>{mounted ? fmt(iso, withYear) : "…"}</time>;
}
