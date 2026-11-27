import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";

function Logo({ small = false }: { small?: boolean }) {
  return (
    <span aria-hidden className={`grid place-items-center rounded-full border border-white/30 bg-white/10 ${small ? "h-9 w-9" : "h-11 w-11"}`}>
      <svg viewBox="0 0 24 24" className={small ? "h-4 w-4" : "h-5 w-5"} fill="none" stroke="currentColor" strokeWidth="1.8">
        <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
        <path d="M9 12l2 2 4-4" />
      </svg>
    </span>
  );
}

const FEATURES = [
  ["Server-timed & fair", "The server clock decides time, never the device."],
  ["Never lose an answer", "Autosave, offline recovery and resume after refresh."],
  ["Transparent results", "Verifiable reports and an open dispute process."],
];

/**
 * Full-screen split layout for login / signup / change-password, sized to fit one screen
 * (no page scrollbar on laptops and phones). On very small screens only the form column scrolls.
 */
export function AuthPage({
  eyebrow, title, badge, intro, children, footer,
}: {
  eyebrow: string; title: string; badge?: string; intro?: ReactNode; children: ReactNode; footer?: ReactNode;
}) {
  return (
    <div className="grid h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Brand panel (desktop) */}
      <aside className="header-band relative hidden flex-col justify-between overflow-hidden p-10 lg:flex">
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-24 h-80 w-80 rounded-full border-[40px] border-white/5" />
        <div aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 h-96 w-96 rounded-full border-[48px] border-white/5" />
        <div className="relative flex items-center gap-3">
          <Logo />
          <div className="leading-tight">
            <p className="font-serif text-xl tracking-wide">SecureExam</p>
            <p className="eyebrow text-[0.62rem] text-on-header-muted">Examination Portal</p>
          </div>
        </div>
        <div className="relative max-w-md">
          <h2 className="font-display text-4xl leading-tight">Secure, fair online examinations.</h2>
          <ul className="mt-8 space-y-5">
            {FEATURES.map(([t, d]) => (
              <li key={t} className="flex gap-3">
                <span aria-hidden className="mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/15 text-xs">✓</span>
                <span><span className="block font-semibold">{t}</span><span className="text-sm text-on-header-muted">{d}</span></span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative eyebrow text-[0.62rem] text-on-header-muted">Web-e-Thon · Technoverse 5.0</p>
      </aside>

      {/* Form column */}
      <div className="flex min-h-0 flex-col">
        <div className="header-band flex items-center justify-between px-5 py-3 lg:hidden">
          <div className="flex items-center gap-2.5"><Logo small /><span className="font-serif text-lg">SecureExam</span></div>
          <ThemeToggle />
        </div>
        <div className="hidden justify-end px-8 pt-6 lg:flex"><ThemeToggle /></div>
        <main className="flex min-h-0 flex-1 items-start justify-center overflow-y-auto px-4 pt-6 pb-3 sm:px-5 sm:pt-10 lg:pt-[6vh] [scrollbar-width:thin]">
          <section aria-labelledby="auth-title" className="w-full max-w-md">
            <div className="mb-3 flex items-start justify-between gap-3 sm:mb-5">
              <div>
                <p className="eyebrow text-muted">{eyebrow}</p>
                <h1 id="auth-title" className="font-display mt-1 text-[1.6rem] leading-tight sm:text-[2rem]">{title}</h1>
              </div>
              {badge && <span className="mt-2 shrink-0 rounded-full border border-line bg-surface-2 px-3 py-1 text-xs font-bold text-brand">{badge}</span>}
            </div>
            {intro && <div className="mb-3 text-sm text-muted sm:mb-4">{intro}</div>}
            <div className="rounded-3xl border border-line bg-surface p-5 shadow-[0_10px_40px_-24px_rgba(0,0,0,0.35)] max-sm:p-4 sm:p-6">{children}</div>
            {footer && <div className="mt-3 text-center text-sm text-muted sm:mt-4">{footer}</div>}
          </section>
        </main>
      </div>
    </div>
  );
}

/** Shown while the server checks the session. */
export function FormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
          <div className="h-10 animate-pulse rounded-xl bg-surface-2" />
        </div>
      ))}
      <div className="h-11 animate-pulse rounded-full bg-surface-2" />
    </div>
  );
}
