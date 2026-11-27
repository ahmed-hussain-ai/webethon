"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function fmt(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (d) return `${d}d ${h}h ${m}m`;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
  return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

/**
 * Counts down to `target` using the SERVER's clock: the offset between server and device time
 * is measured once, so a wrong device clock doesn't change what is shown.
 * `refreshAtZero` reloads server data when the moment arrives (e.g. an exam opens).
 */
export function Countdown({ target, serverNow, refreshAtZero = false, className = "" }: { target: string; serverNow: string; refreshAtZero?: boolean; className?: string }) {
  const router = useRouter();
  const offset = useRef<number | null>(null);
  const [left, setLeft] = useState<number | null>(null);
  const fired = useRef(false);

  useEffect(() => {
    offset.current = Date.parse(serverNow) - Date.now();
    const tick = () => {
      const ms = Date.parse(target) - (Date.now() + (offset.current ?? 0));
      setLeft(ms);
      if (ms <= 0 && refreshAtZero && !fired.current) {
        fired.current = true;
        setTimeout(() => router.refresh(), 1000);
      }
    };
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [target, serverNow, refreshAtZero, router]);

  return <span className={`font-mono tabular-nums ${className}`} suppressHydrationWarning>{left === null ? "…" : fmt(left)}</span>;
}
