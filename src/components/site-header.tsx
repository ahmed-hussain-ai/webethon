import type { ReactNode } from "react";
import { ThemeToggle } from "./theme-toggle";
import { BRAND, BrandBadge } from "./brand";


/** Teal (light) / navy (dark) band at the top of every page. */
export function SiteHeader({ children }: { children?: ReactNode }) {
  return (
    <header className="header-band">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-3 px-5 py-4">
        <div className="flex items-center gap-3">
          <BrandBadge />
          <div className="leading-tight">
            <p className="font-serif text-lg tracking-wide">{BRAND.name}</p>
            <p className="eyebrow text-[0.62rem] text-on-header-muted">{BRAND.tagline}</p>
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
