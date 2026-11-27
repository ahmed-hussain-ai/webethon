import Link from "next/link";
import { Suspense } from "react";
import { ShellSkeleton, StaffShell } from "@/components/staff-shell";
import { ExamHeader } from "@/components/exams/exam-header";
import { ResultsActions } from "@/components/results/results-actions";
import { DifficultyBadge } from "@/components/badges";
import { LocalTime } from "@/components/local-time";
import { requirePageRole } from "@/lib/auth/page-guards";
import { getResults, questionAnalytics } from "@/lib/results/service";
import { loadExamPage } from "../shared";

export const metadata = { title: "Results · SecureExam" };

function Tile({ label, value, sub }: { label: string; value: string | number | null; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-surface px-4 py-3">
      <p className="eyebrow text-muted">{label}</p>
      <p className="mt-1 font-mono text-2xl font-semibold">{value ?? "–"}</p>
      {sub && <p className="text-xs text-muted">{sub}</p>}
    </div>
  );
}

async function Content({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePageRole("EXAMINER", "ADMIN");
  const exam = await loadExamPage(user, (await params).id);
  const [r, analytics] = await Promise.all([getResults(user, exam.id), questionAnalytics(user, exam.id)]);
  const s = r.summary;
  const maxBucket = Math.max(1, ...s.distribution.map((b) => b.count));
  const published = r.exam.resultsStatus === "PUBLISHED";

  return (
    <StaffShell user={user} active="exams">
      <ExamHeader exam={exam} tab="results" />
      <div className="space-y-6">
        <section className="flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-line bg-surface p-5">
          <div>
            <h2 className="font-display text-2xl">{published ? "Results published" : "Results not published"}</h2>
            {published ? (
              <p className="mt-1 text-sm text-muted">Published <LocalTime iso={r.exam.resultsPublishedAt} />. Candidates can see their own scores. Changes now go through disputes.</p>
            ) : r.blockers.length ? (
              <ul className="mt-2 space-y-1 text-sm">{r.blockers.map((b) => <li key={b} className="text-danger">✗ {b}</li>)}</ul>
            ) : (
              <p className="mt-1 text-sm text-success">✓ Everything is marked. Review the scores below, then publish.</p>
            )}
          </div>
          <div className="space-y-2">
            <ResultsActions examId={exam.id} aiEnabled={r.exam.autoCheckWritten} aiAvailable={r.aiAvailable} canPublish={r.canPublish} published={published} />
            {s.submitted > 0 && <a href={`/api/exams/${exam.id}/results/pdf`} className="inline-block text-sm font-semibold text-brand underline">Download exam report (PDF)</a>}
          </div>
        </section>

        <section aria-label="Summary" className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          <Tile label="Submitted" value={s.submitted} />
          <Tile label="In progress" value={s.inProgress} />
          <Tile label="Absent" value={s.absent} />
          <Tile label="To mark" value={s.pendingAnswers} sub="written answers" />
          <Tile label="Average" value={s.average} sub={`of ${r.exam.totalMarks}`} />
          <Tile label="Median" value={s.median} />
          <Tile label="High / low" value={s.highest === null ? null : `${s.highest}/${s.lowest}`} />
          <Tile label="Pass rate" value={s.passRate === null ? null : `${s.passRate}%`} sub={`pass mark ${r.exam.passMarks}`} />
        </section>

        {s.submitted > 0 && (
          <section aria-labelledby="dist" className="rounded-3xl border border-line bg-surface p-5">
            <h2 id="dist" className="eyebrow mb-4 text-muted">Score distribution (%)</h2>
            <div className="flex h-40 items-end gap-2" role="img" aria-label={s.distribution.map((b) => `${b.from}-${b.to}%: ${b.count}`).join(", ")}>
              {s.distribution.map((b) => (
                <div key={b.from} className="flex flex-1 flex-col items-center justify-end gap-1">
                  <span className="font-mono text-xs">{b.count || ""}</span>
                  <div className={`w-full rounded-t-lg ${b.from >= (r.exam.passMarks / r.exam.totalMarks) * 100 ? "bg-brand" : "bg-line-strong"}`} style={{ height: `${(b.count / maxBucket) * 100}%`, minHeight: b.count ? 6 : 2 }} />
                  <span className="font-mono text-[0.65rem] text-muted">{b.from}</span>
                </div>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="cands" className="overflow-hidden rounded-3xl border border-line bg-surface">
          <h2 id="cands" className="eyebrow px-5 pt-5 text-muted">Candidates</h2>
          {r.attempts.length === 0 ? (
            <p className="px-5 py-8 text-sm text-muted">No attempts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="mt-2 w-full text-left text-sm">
                <thead><tr className="eyebrow text-muted"><th className="px-5 py-2">Candidate</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Answered</th><th className="px-3 py-2 text-right">Score</th><th className="px-3 py-2 text-right">%</th><th className="px-3 py-2">Result</th><th className="px-5 py-2" /></tr></thead>
                <tbody>
                  {r.attempts.map((a) => (
                    <tr key={a.id} className="border-t border-line">
                      <td className="px-5 py-3"><p className="font-semibold">{a.candidate.name}</p><p className="text-xs text-muted">{a.candidate.email}</p></td>
                      <td className="px-3 py-3">{a.status === "IN_PROGRESS" ? <span className="text-[#c99a3d]">Writing…</span> : a.status === "AUTO_SUBMITTED" ? "Time-up" : "Submitted"}</td>
                      <td className="px-3 py-3 font-mono">{a.answered}</td>
                      <td className="px-3 py-3 text-right font-mono">{a.score ?? "–"}</td>
                      <td className="px-3 py-3 text-right font-mono">{a.percent ?? "–"}</td>
                      <td className="px-3 py-3">
                        {a.pending > 0 ? <span className="rounded-full bg-notice px-2 py-0.5 text-xs font-bold">{a.pending} to mark</span>
                          : a.passed === null ? "–" : a.passed ? <span className="font-bold text-success">Pass</span> : <span className="font-bold text-danger">Fail</span>}
                      </td>
                      <td className="px-5 py-3 text-right">
                        {a.status !== "IN_PROGRESS" && <Link className="font-semibold text-brand hover:underline" href={`/exams/${exam.id}/results/${a.id}`}>{a.pending ? "Mark" : "Review"} →</Link>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.absent.length > 0 && <p className="border-t border-line px-5 py-3 text-sm text-muted">Didn&apos;t attempt: {r.absent.map((x) => x.name).join(", ")}</p>}
        </section>

        <section aria-labelledby="qa" className="overflow-hidden rounded-3xl border border-line bg-surface">
          <h2 id="qa" className="eyebrow px-5 pt-5 text-muted">Question analytics</h2>
          <p className="px-5 text-xs text-muted">From real submissions only (previews excluded). Observed difficulty: average ≥ 70% easy, 40–70% medium, below 40% hard.</p>
          <div className="overflow-x-auto">
            <table className="mt-3 w-full text-left text-sm">
              <thead><tr className="eyebrow text-muted"><th className="px-5 py-2">#</th><th className="px-3 py-2">Question</th><th className="px-3 py-2 text-right">Avg</th><th className="px-3 py-2 text-right">Full marks</th><th className="px-3 py-2 text-right">Skipped</th><th className="px-3 py-2">Difficulty (set → seen)</th><th className="px-5 py-2">Most common wrong answer</th></tr></thead>
              <tbody>
                {analytics.map((q) => (
                  <tr key={q.questionId} className="border-t border-line align-top">
                    <td className="px-5 py-3 font-mono text-muted">{q.number}</td>
                    <td className="max-w-sm px-3 py-3"><p className="line-clamp-2">{q.text}</p></td>
                    <td className="px-3 py-3 text-right font-mono">{q.averagePercent === null ? "–" : `${q.averagePercent}%`}</td>
                    <td className="px-3 py-3 text-right font-mono">{q.fullMarksRate === null ? "–" : `${q.fullMarksRate}%`}</td>
                    <td className={`px-3 py-3 text-right font-mono ${q.skippedRate && q.skippedRate >= 30 ? "font-bold text-danger" : ""}`}>{q.skippedRate === null ? "–" : `${q.skippedRate}%`}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1">
                        {q.labelled && <DifficultyBadge difficulty={q.labelled as "EASY" | "MEDIUM" | "HARD"} />}
                        {q.observed && <>→ <DifficultyBadge difficulty={q.observed as "EASY" | "MEDIUM" | "HARD"} /></>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-xs">{q.commonWrong ? `"${q.commonWrong.text}" (${q.commonWrong.count}×)` : "–"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </StaffShell>
  );
}

export default function ResultsPage(props: PageProps<"/exams/[id]/results">) {
  return <Suspense fallback={<ShellSkeleton />}><Content params={props.params} /></Suspense>;
}
