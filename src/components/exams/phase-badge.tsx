import { PHASE_LABEL, type ExamPhase } from "@/lib/exams/status";

const STYLE: Record<ExamPhase, string> = {
  DRAFT: "border-line-strong bg-surface-2 text-muted",
  SCHEDULED: "border-notice-line bg-notice text-ink",
  ONGOING: "border-success/40 bg-success-soft text-success",
  COMPLETED: "border-line bg-surface-2 text-ink",
};

export function PhaseBadge({ phase }: { phase: ExamPhase }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-bold ${STYLE[phase]}`}>
      {phase === "ONGOING" && <span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-current" />}
      {PHASE_LABEL[phase]}
    </span>
  );
}
