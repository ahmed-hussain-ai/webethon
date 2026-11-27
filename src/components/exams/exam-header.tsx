import Link from "next/link";
import type { ExamDetail } from "@/lib/exams/service";
import { LocalTime } from "@/components/local-time";
import { PhaseBadge } from "./phase-badge";

export type ExamTab = "settings" | "questions" | "candidates" | "review" | "results";

export function ExamHeader({ exam, tab }: { exam: ExamDetail; tab: ExamTab }) {
  const blocking = exam.checks.filter((c) => c.blocking && !c.ok).length;
  const tabs: { key: ExamTab; href: string; label: string; badge?: string }[] = [
    { key: "settings", href: `/exams/${exam.id}`, label: "Settings" },
    { key: "questions", href: `/exams/${exam.id}/questions`, label: "Questions", badge: String(exam.questions.length) },
    { key: "candidates", href: `/exams/${exam.id}/candidates`, label: "Candidates", badge: String(exam.activeEnrollments) },
    { key: "review", href: `/exams/${exam.id}/review`, label: exam.status === "DRAFT" ? "Review & publish" : "Review", badge: exam.status === "DRAFT" && blocking ? `${blocking} to fix` : undefined },
    ...(exam.status === "PUBLISHED" ? [{ key: "results" as const, href: `/exams/${exam.id}/results`, label: exam.phase === "COMPLETED" ? "Results" : "Live & results" }] : []),
  ];
  return (
    <div className="mb-6">
      <Link href="/exams" className="mb-4 inline-block text-sm font-semibold text-brand hover:underline">← All exams</Link>
      <div className="overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="header-band flex flex-wrap items-start justify-between gap-4 px-6 py-5">
          <div className="min-w-0">
            <p className="eyebrow text-on-header-muted">Exam · by {exam.ownerName}</p>
            <h1 className="font-display mt-1 break-words text-3xl">{exam.title}</h1>
          </div>
          <PhaseBadge phase={exam.phase} />
        </div>
        <dl className="grid grid-cols-2 gap-px bg-line text-sm sm:grid-cols-5">
          {[
            ["Starts", <LocalTime key="s" iso={exam.startAt} />],
            ["Ends", <LocalTime key="e" iso={exam.endAt} />],
            ["Duration", `${exam.durationMinutes} min`],
            ["Marks", `${exam.assignedMarks} / ${exam.totalMarks}`],
            ["Enrolled", exam.activeEnrollments],
          ].map(([k, v]) => (
            <div key={k as string} className="bg-surface px-5 py-3">
              <dt className="eyebrow text-muted">{k}</dt>
              <dd className="mt-0.5 font-semibold">{v}</dd>
            </div>
          ))}
        </dl>
        <nav aria-label="Exam sections" className="border-t border-line bg-surface-2 px-3 py-2">
          <ul className="flex gap-1 overflow-x-auto">
            {tabs.map((t) => (
              <li key={t.key} className="shrink-0">
                <Link
                  href={t.href}
                  aria-current={tab === t.key ? "page" : undefined}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition ${
                    tab === t.key ? "bg-brand text-on-brand" : "text-muted hover:bg-surface hover:text-ink"
                  }`}
                >
                  {t.label}
                  {t.badge && (
                    <span className={`rounded-full px-2 py-0.5 font-mono text-[0.7rem] ${tab === t.key ? "bg-white/20" : t.badge.includes("fix") ? "bg-danger-soft text-danger" : "bg-surface"}`}>
                      {t.badge}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </div>
  );
}
