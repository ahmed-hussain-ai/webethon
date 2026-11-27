import { SiteHeader } from "@/components/site-header";
import { btn } from "@/components/staff-shell";

export const metadata = { title: "Verify a result · Examora" };

// Public page: no login needed. A GET form, so it works without JavaScript.
export default function VerifyPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="flex flex-1 items-start justify-center px-4 py-12">
        <form action="/verify/lookup" method="get" className="w-full max-w-md space-y-4 rounded-3xl border border-line bg-surface p-6">
          <p className="eyebrow text-muted">Public verification</p>
          <h1 className="font-display text-3xl">Verify a result report</h1>
          <p className="text-sm text-muted">Enter the code printed at the bottom of the report (e.g. ABCD-EFGH-JKLM), or scan its QR code.</p>
          <label htmlFor="code" className="block text-sm font-semibold">Verification code</label>
          <input id="code" name="code" required maxLength={20} autoComplete="off" placeholder="XXXX-XXXX-XXXX"
            className="w-full rounded-xl border border-line bg-surface-2 px-3.5 py-2.5 font-mono uppercase tracking-widest focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]" />
          <button className={`${btn.primary} w-full`}>Verify</button>
        </form>
      </main>
    </>
  );
}
