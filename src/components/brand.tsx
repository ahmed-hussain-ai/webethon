/** Brand: Examora. The mark is a stopwatch (the server owns the clock) holding a check (verified results). */
export const BRAND = { name: "Examora", tagline: "Fair exams. Verified results." } as const;

export function BrandMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="12.5" y="2" width="7" height="3.2" rx="1.6" fill="currentColor" stroke="none" />
      <path d="M16 5.2v2.6" strokeWidth="2.4" />
      <path d="M25.2 8.6l1.9-1.9" strokeWidth="2.4" />
      <path d="M26.4 15.2A11 11 0 1 1 20.8 8.1" strokeWidth="2.6" />
      <path d="M10.8 18.6l3.7 3.7 8.2-8.6" strokeWidth="3" />
    </svg>
  );
}

/** Round badge used on the coloured header band. */
export function BrandBadge({ small = false }: { small?: boolean }) {
  return (
    <span aria-hidden className={`grid shrink-0 place-items-center rounded-2xl border border-white/30 bg-white/10 ${small ? "h-9 w-9" : "h-11 w-11"}`}>
      <BrandMark className={small ? "h-5 w-5" : "h-6 w-6"} />
    </span>
  );
}
