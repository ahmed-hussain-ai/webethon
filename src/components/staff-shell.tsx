import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "./site-header";
import { LogoutButton } from "./logout-button";
import type { CurrentUser } from "@/lib/auth/current-user";

export type StaffNav = "dashboard" | "exams" | "questions" | "categories" | "import" | "users";

const NAV: { key: StaffNav; href: string; label: string }[] = [
  { key: "dashboard", href: "/dashboard", label: "Dashboard" },
  { key: "exams", href: "/exams", label: "Exams" },
  { key: "questions", href: "/questions", label: "Question Bank" },
  { key: "categories", href: "/categories", label: "Categories" },
  { key: "import", href: "/questions/import", label: "Import" },
];

/** Header + pill navigation (like the course tabs in the reference) for examiners/admins. */
export function StaffShell({ user, active, children }: { user: Pick<CurrentUser, "name" | "role">; active: StaffNav; children: ReactNode }) {
  return (
    <>
      <SiteHeader>
        <p className="hidden font-mono text-sm md:block">
          <span className="text-on-header-muted">Welcome :</span> {user.name}
        </p>
        <LogoutButton />
      </SiteHeader>
      <nav aria-label="Main" className="header-band border-t border-white/10">
        <ul className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-5 py-3">
          {[...NAV, ...(user.role === "ADMIN" ? [{ key: "users" as const, href: "/admin/users", label: "Users" }] : [])].map((n) => (
            <li key={n.key} className="shrink-0">
              <Link
                href={n.href}
                aria-current={active === n.key ? "page" : undefined}
                className={`block rounded-xl px-4 py-2 text-sm font-semibold transition ${active === n.key ? "chip-active" : "chip hover:bg-white/15"}`}
              >
                {n.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}

export function PageTitle({ eyebrow, title, actions }: { eyebrow: string; title: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow text-muted">{eyebrow}</p>
        <h1 className="font-display mt-1 text-3xl">{title}</h1>
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function ShellSkeleton() {
  return (
    <>
      <SiteHeader />
      <div className="header-band h-[60px] border-t border-white/10" />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8" aria-busy="true">
        <div className="mb-6 h-12 w-64 animate-pulse rounded-xl bg-surface" />
        <div className="h-72 animate-pulse rounded-3xl bg-surface" />
      </main>
    </>
  );
}

export const btn = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-full bg-brand px-5 py-2.5 text-sm font-semibold text-on-brand transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-60",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-full border border-line-strong bg-surface px-5 py-2.5 text-sm font-semibold text-ink transition hover:border-brand hover:text-brand disabled:cursor-not-allowed disabled:opacity-60",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-full border border-danger-line bg-danger-soft px-5 py-2.5 text-sm font-semibold text-danger transition hover:brightness-95 disabled:cursor-not-allowed disabled:opacity-60",
};
