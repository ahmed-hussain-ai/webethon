"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { ExamDispute } from "@/lib/disputes/service";
import { FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";

const LETTERS = "ABCDEFGHIJ";
const CAT = { GRADING_ERROR: "Marking error", AMBIGUOUS_QUESTION: "Ambiguous or incorrect question", TECHNICAL_ISSUE: "Technical problem", OTHER: "Other" } as const;

export function ResolveDispute({ examId, d }: { examId: string; d: ExamDispute }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [marks, setMarks] = useState(d.question ? String(d.question.current ?? 0) : "");
  const [applyToAll, setApplyToAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string>();
  const done = d.status === "ACCEPTED" || d.status === "REJECTED";

  async function send(body: object) {
    setBusy(true);
    setErr(undefined);
    const r = await fetch(`/api/exams/${examId}/disputes/${d.id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) return setErr(j?.error?.fields ? Object.values(j.error.fields).join(" ") : j?.error?.message ?? "Couldn't save");
    router.refresh();
  }

  return (
    <article className={`rounded-3xl border bg-surface ${done ? "border-line" : "border-[#e0a030]"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <p className="font-semibold">{d.candidate.name} <span className="font-normal text-muted">· {d.question ? `Question ${d.question.number}` : "Whole result"} · {CAT[d.category]}</span></p>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${d.status === "ACCEPTED" ? "bg-success-soft text-success" : d.status === "REJECTED" ? "bg-danger-soft text-danger" : "bg-notice"}`}>
          {d.status === "UNDER_REVIEW" ? "Under review" : d.status.charAt(0) + d.status.slice(1).toLowerCase()}
        </span>
      </div>
      <div className="space-y-4 p-5 text-sm">
        <blockquote className="rounded-2xl bg-surface-2 p-4"><p className="eyebrow mb-1 text-muted">Candidate says</p>{d.description}</blockquote>
        {d.question && (
          <div className="space-y-2">
            <p className="whitespace-pre-wrap font-medium">{d.question.text}</p>
            {d.question.type === "WRITTEN" ? (
              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-line p-3"><p className="eyebrow mb-1 text-muted">Their answer</p><p className="whitespace-pre-wrap">{d.question.textAnswer || "—"}</p></div>
                <div className="rounded-2xl border border-success/40 bg-success-soft p-3"><p className="eyebrow mb-1 text-muted">Correct answer</p><p className="whitespace-pre-wrap">{d.question.modelAnswer}</p></div>
              </div>
            ) : (
              <ul className="space-y-1">
                {d.question.options.map((o, i) => (
                  <li key={o.id} className={`flex gap-2 rounded-xl border px-3 py-1.5 ${o.correct ? "border-success/50 bg-success-soft" : o.picked ? "border-danger-line bg-danger-soft" : "border-line"}`}>
                    <span className="font-mono text-xs font-bold">{LETTERS[i]}</span><span className="flex-1">{o.text}</span>{o.picked && <span className="text-xs font-bold">chosen</span>}
                  </li>
                ))}
              </ul>
            )}
            <p className="font-mono">Current mark: {d.question.current} / {d.question.marks} · total {d.score} / {d.totalMarks}</p>
          </div>
        )}
        {done ? (
          <div className="rounded-2xl border border-line p-4">
            <p><strong>Response:</strong> {d.resolutionNote}</p>
            {d.status === "ACCEPTED" && <p className="mt-1 font-mono text-xs text-muted">Score {d.scoreBefore} → {d.scoreAfter}{d.appliedToAll ? ` · same correction applied to ${d.appliedToAll} other candidate(s)` : ""}</p>}
          </div>
        ) : (
          <div className="space-y-3 border-t border-line pt-4">
            <label className="block"><span className="mb-1 block font-semibold">Response to the candidate (required)</span>
              <textarea rows={3} maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-xl border border-line bg-surface-2 p-3 focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]" />
            </label>
            {d.question && (
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2"><span className="font-semibold">New mark if accepted</span>
                  <input type="number" min={0} max={d.question.marks} step={0.25} value={marks} onChange={(e) => setMarks(e.target.value)} className="w-24 rounded-xl border border-line bg-surface-2 px-2 py-1.5 font-mono" />
                  <span className="text-muted">/ {d.question.marks}</span>
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} className="accent-[var(--brand)]" />
                  Apply to every candidate (raises lower marks on this question, never lowers)
                </label>
              </div>
            )}
            {err && <FormAlert>{err}</FormAlert>}
            <div className="flex flex-wrap gap-2">
              <button type="button" className={btn.primary} disabled={busy} onClick={() => send({ decision: "ACCEPT", note, marks: d.question ? Number(marks) : null, applyToAll })}>Accept</button>
              <button type="button" className={btn.danger} disabled={busy} onClick={() => send({ decision: "REJECT", note })}>Reject</button>
              {d.status === "OPEN" && <button type="button" className={btn.secondary} disabled={busy} onClick={() => send({ decision: "UNDER_REVIEW" })}>Mark as under review</button>}
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
