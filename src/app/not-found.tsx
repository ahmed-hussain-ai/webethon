import Link from "next/link";
import { SiteHeader } from "@/components/site-header";
import { btn } from "@/components/staff-shell";

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-start justify-center px-4 py-16">
        <section className="w-full max-w-md space-y-4 rounded-3xl border border-line bg-surface p-8 text-center">
          <p className="eyebrow text-muted">Error 404</p>
          <h1 className="font-display text-3xl">Not found</h1>
          <p className="text-sm text-muted">This page doesn&apos;t exist, or you don&apos;t have access to it.</p>
          <Link href="/dashboard" className={`${btn.primary} inline-block`}>Go to my home</Link>
        </section>
      </main>
    </>
  );
}
