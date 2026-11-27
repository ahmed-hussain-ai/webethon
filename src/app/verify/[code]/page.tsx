import Link from "next/link";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { LocalTime } from "@/components/local-time";
import { headers } from "next/headers";
import { verifyCode } from "@/lib/results/reports";
import { clientIp, hit } from "@/lib/rate-limit";

export const metadata = { title: "Verification · SecureExam" };

async function Result({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const h = await headers();
  if (!hit(`verify:${clientIp(new Request("http://x", { headers: h }))}`, 30, 60_000).ok) {
    return (
      <div className="space-y-3 text-center" role="alert">
        <h1 className="font-display text-3xl">Too many checks</h1>
        <p className="text-sm text-muted">Please wait a minute and try again.</p>
      </div>
    );
  }
  const r = await verifyCode(decodeURIComponent(code));
  if (!r) {
    return (
      <div className="space-y-3 text-center">
        <p className="text-5xl" aria-hidden>✗</p>
        <h1 className="font-display text-3xl">No matching report</h1>
        <p className="text-sm text-muted">The code <span className="font-mono">{decodeURIComponent(code)}</span> doesn&apos;t match any issued report. Check it and try again.</p>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <div className={`rounded-2xl p-4 text-center ${r.valid ? "bg-success-soft text-success" : "bg-notice text-ink"}`} role="status">
        <p className="text-3xl font-bold" aria-hidden>{r.valid ? "✓" : "!"}</p>
        <p className="font-semibold">{r.valid ? "Authentic, current report" : "Authentic but superseded: marks were updated after this report was issued"}</p>
      </div>
      <dl className="grid grid-cols-2 gap-4 text-sm">
        <div><dt className="eyebrow text-muted">Candidate</dt><dd className="font-mono font-semibold">{r.candidate}</dd></div>
        <div><dt className="eyebrow text-muted">Exam</dt><dd className="font-semibold">{r.exam}</dd></div>
        <div><dt className="eyebrow text-muted">Score</dt><dd className="font-mono font-semibold">{r.score} / {r.total} ({r.percent}%)</dd></div>
        <div><dt className="eyebrow text-muted">Result</dt><dd className="font-semibold">{r.passed ? "Passed" : "Not passed"}</dd></div>
        <div><dt className="eyebrow text-muted">Issued</dt><dd><LocalTime iso={r.issuedAt} withYear /></dd></div>
        <div><dt className="eyebrow text-muted">Code</dt><dd className="font-mono">{r.code}</dd></div>
      </dl>
      <p className="text-xs text-muted">Only the minimum needed to confirm authenticity is shown. The name is partly hidden for privacy.</p>
    </div>
  );
}

export default function VerifyCodePage(props: PageProps<"/verify/[code]">) {
  return (
    <>
      <SiteHeader />
      <main className="flex flex-1 items-start justify-center px-4 py-12">
        <section className="w-full max-w-lg space-y-5 rounded-3xl border border-line bg-surface p-6">
          <p className="eyebrow text-muted">Result verification</p>
          <Suspense fallback={<p className="text-sm text-muted">Checking…</p>}><Result params={props.params} /></Suspense>
          <Link href="/verify" className="inline-block text-sm font-semibold text-brand hover:underline">Check another code</Link>
        </section>
      </main>
    </>
  );
}
