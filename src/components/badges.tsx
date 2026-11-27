import { DIFFICULTY_LABEL, TYPE_LABEL } from "@/lib/validation/questions";

const base = "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap";

export function TypeBadge({ type }: { type: keyof typeof TYPE_LABEL }) {
  return <span className={`${base} border-line bg-surface-2 text-ink`}>{TYPE_LABEL[type]}</span>;
}

const DIFF_STYLE = {
  EASY: "border-success/30 bg-success-soft text-success",
  MEDIUM: "border-notice-line bg-notice text-ink",
  HARD: "border-danger-line bg-danger-soft text-danger",
} as const;
export function DifficultyBadge({ difficulty }: { difficulty: keyof typeof DIFFICULTY_LABEL }) {
  return <span className={`${base} ${DIFF_STYLE[difficulty]}`}>{DIFFICULTY_LABEL[difficulty]}</span>;
}

export function LockBadge() {
  return (
    <span className={`${base} border-line-strong bg-surface-2 text-muted`} title="Used in a published exam: can't be edited">
      <svg aria-hidden viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="2.5">
        <rect x="5" y="11" width="14" height="10" rx="2" />
        <path d="M8 11V7a4 4 0 018 0v4" />
      </svg>
      Locked
    </span>
  );
}

export function InactiveBadge() {
  return <span className={`${base} border-line bg-surface-2 text-muted line-through`}>Inactive</span>;
}
