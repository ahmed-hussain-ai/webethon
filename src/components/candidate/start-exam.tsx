"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";
import { FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";

/** Start (or resume) button. The server decides everything; double clicks are harmless. */
export function StartExam({ examId, resume, minutes, shortened }: { examId: string; resume: boolean; minutes: number | null; shortened: boolean }) {
  const router = useRouter();
  const [agreed, setAgreed] = useState(resume);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  async function go() {
    if (busy || !agreed) return;
    setBusy(true);
    setError(undefined);
    const r = await postJson<{ attemptId: string }>(`/api/my/exams/${examId}/start`);
    if (r.ok) {
      router.push(`/attempts/${r.data.attemptId}`);
      return;
    }
    setBusy(false);
    setError(r.error.message);
    router.refresh(); // state may have changed (closed, removed…)
  }

  return (
    <div className="space-y-4">
      {!resume && (
        <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4 text-sm">
          <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
          <span>
            I have read the instructions. I understand the timer starts when I press <strong>Start exam</strong>, keeps running if I close the page or lose
            connection{minutes !== null ? <>, and that I will have <strong>{minutes} minute{minutes === 1 ? "" : "s"}</strong></> : ""}.
          </span>
        </label>
      )}
      {shortened && !resume && (
        <FormAlert tone="notice">The exam closes soon, so you will get less than the full duration. Start now to use the time left.</FormAlert>
      )}
      {error && <FormAlert>{error}</FormAlert>}
      <button type="button" className={`${btn.primary} w-full py-3 text-base sm:w-auto`} disabled={!agreed || busy} aria-busy={busy} onClick={go}>
        {busy ? (resume ? "Opening…" : "Starting…") : resume ? "Resume exam" : "Start exam"}
      </button>
    </div>
  );
}
