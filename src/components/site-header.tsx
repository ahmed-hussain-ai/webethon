import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";

function Logo() {
  return (
    <span aria-hidden className="grid h-10 w-10 place-items-center rounded-full border border-white/30 bg-white/10">
      <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    </span>
  );
}

/** Teal (light) / navy (dark) band at the top of every page. */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="header-band">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <Logo />
          <div className="leading-tight">
            <p className="font-serif text-lg tracking-wide">SecureExam</p>
            <p className="eyebrow text-[0.62rem] text-on-header-muted">Examination Portal</p>
          </div>
        </div>
        <div className="ml-auto flex items-center gap-4">
          {children}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
