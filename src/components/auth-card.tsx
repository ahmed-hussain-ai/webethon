import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";

/** Page frame for login / signup / change-password: header band + one card
 *  whose top strip mirrors the "CLASS SESSION / Class attendance" panel of the reference. */
export function AuthPage({
  eyebrow,
  title,
  badge,
  intro,
  children,
  footer,
}: {
  eyebrow: string;
  title: string;
  badge?: string;
  intro?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:py-16">
        <section aria-labelledby="auth-title" className="w-full max-w-md overflow-hidden rounded-3xl border border-line bg-surface shadow-[0_10px_40px_-20px_rgba(0,0,0,0.35)]">
          <div className="header-band flex items-start justify-between gap-4 px-6 py-5">
            <div>
              <p className="eyebrow text-on-header-muted">{eyebrow}</p>
              <h1 id="auth-title" className="font-display mt-1 text-[1.75rem] leading-tight">
                {title}
              </h1>
            </div>
            {badge && <span className="chip-active mt-1 shrink-0 rounded-full px-3 py-1 text-xs font-bold">{badge}</span>}
          </div>
          <div className="space-y-5 px-6 py-6">
            {intro && <div className="text-sm text-muted">{intro}</div>}
            {children}
          </div>
          {footer && <div className="border-t border-line bg-surface-2 px-6 py-4 text-center text-sm text-muted">{footer}</div>}
        </section>
      </main>
    </>
  );
}

/** Shown while the server checks the session. */
export function FormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div className="space-y-5" aria-busy="true" aria-label="Loading">
      {Array.from({ length: fields }).map((_, i) => (
        <div key={i} className="space-y-2">
          <div className="h-4 w-24 animate-pulse rounded bg-surface-2" />
          <div className="h-11 animate-pulse rounded-xl bg-surface-2" />
        </div>
      ))}
      <div className="h-12 animate-pulse rounded-full bg-surface-2" />
    </div>
  );
}
