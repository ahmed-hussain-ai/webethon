"use client";

import { useState } from "react";
import { postJson } from "@/lib/client/api";

export function LogoutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        await postJson("/api/auth/logout");
        // Full reload, not client navigation: wipes every kept-alive page and cached
        // user data from the browser, so the next person on a shared computer sees nothing.
        window.location.replace("/login");
      }}
      className="chip inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition hover:bg-white/20 disabled:opacity-60"
    >
      <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3M10 17l5-5-5-5M15 12H3" />
      </svg>
      {pending ? "Logging out…" : "Logout"}
    </button>
  );
}
