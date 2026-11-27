import Link from "next/link";
import type { ReactNode } from "react";
import { SiteHeader } from "@/components/site-header";
import { LogoutButton } from "@/components/logout-button";

export function CandidateShell({ name, children }: { name: string; children: ReactNode }) {
  return (
    <>
      <SiteHeader>
        <p className="hidden font-mono text-sm md:block">
          <span className="text-on-header-muted">Welcome :</span> {name}
        </p>
        <LogoutButton />
      </SiteHeader>
      <nav aria-label="Main" className="header-band border-t border-white/10">
        <ul className="mx-auto flex max-w-6xl gap-2 px-5 py-3">
          <li><Link href="/my-exams" aria-current="page" className="chip-active block rounded-xl px-4 py-2 text-sm font-semibold">My Exams</Link></li>
        </ul>
      </nav>
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">{children}</main>
    </>
  );
}
