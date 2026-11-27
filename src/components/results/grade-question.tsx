"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { GradingView } from "@/lib/results/service";
import { FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";

type Q = GradingView["questions"][number];
const LETTERS = "ABCDEFGHIJ";

export function GradeQuestion({ examId, attemptId, q, locked }: { examId: string; attemptId: string; q: Q; locked: boolean }) {
  const router = useRouter();
  const a = q.answer;
  const written = q.type === "WRITTEN";
  const [marks, setMarks] = useState(a?.manualMarks !== null && a?.manualMarks !== undefined ? String(a.manualMarks) : "");
  const [feedback, setFeedback] = useState(a?.feedback ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "notice"; text: string }>();
  const flagged = !!a?.aiReason?.startsWith("[FLAGGED");

  async function save(value: string | null) {
    if (!a || busy) return;
    const m = value === null || value === "" ? null : Number(value);
    if (m !== null && (!Number.isFinite(m) || m < 0 || m > q.marks)) return setMsg({ tone: "error", text: `Marks must be between 0 and ${q.marks}` });
    if (written && m === null) return setMsg({ tone: "error", text: "Enter a mark for this written answer" });
    setBusy(true);
    setMsg(undefined);
    try {
      const res = await fetch(`/api/exams/${examId}/attempts/${attemptId}/answers/${a.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ marks: m, feedback: feedback || null }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) setMsg({ tone: "error", text: json?.error?.fields ? Object.values(json.error.fields).join(" ") : json?.error?.message ?? "Couldn't save" });
      else { setMsg({ tone: "notice", text: "Saved." }); if (value === null) setMarks(""); router.refresh(); }
    } catch {
      setMsg({ tone: "error", text: "Can't reach the server. Try again." });
    }
    setBusy(false);
  }

  const status = q.needsMark ? <span className="rounded-full bg-notice px-2.5 py-0.5 text-xs font-bold">Needs your mark</span>
    : <span className="font-mono text-sm font-semibold">{q.final} / {q.marks}</span>;

  return (
    <article className={`rounded-3xl border bg-surface ${q.needsMark ? "border-[#e0a030]" : "border-line"}`} aria-labelledby={`gq-${q.number}`}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <p id={`gq-${q.number}`} className="eyebrow text-muted">Question {q.number} · {q.marks} marks{q.negativeMarks ? ` · −${q.negativeMarks} if wrong` : ""}</p>
        {status}
      </div>
      <div className="space-y-4 p-5">
        <p className="whitespace-pre-wrap">{q.text}</p>
        {!written ? (
          <ul className="space-y-1.5 text-sm">
            {q.options.map((o, i) => {
              const picked = a?.selectedOptionIds.includes(o.id);
              return (
                <li key={o.id} className={`flex items-center gap-2 rounded-xl border px-3 py-2 ${o.correct ? "border-success/50 bg-success-soft" : picked ? "border-danger-line bg-danger-soft" : "border-line"}`}>
                  <span className="font-mono text-xs font-bold">{LETTERS[i]}</span>
                  <span className="flex-1">{o.text}</span>
                  {picked && <span className="text-xs font-bold">{o.correct ? "✓ chosen" : "✗ chosen"}</span>}
                  {!picked && o.correct && <span className="text-xs text-success">correct</span>}
                </li>
              );
            })}
            {!a?.selectedOptionIds.length && <li className="text-muted">Not answered.</li>}
          </ul>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-line bg-surface-2 p-4">
              <p className="eyebrow mb-1 text-muted">Candidate&apos;s answer</p>
              <p className="whitespace-pre-wrap text-sm">{a?.textAnswer?.trim() ? a.textAnswer : <span className="text-muted">No answer (0 marks automatically)</span>}</p>
            </div>
            <div className="rounded-2xl border border-success/40 bg-success-soft p-4">
              <p className="eyebrow mb-1 text-muted">Correct answer</p>
              <p className="whitespace-pre-wrap text-sm">{q.modelAnswer}</p>
            </div>
          </div>
        )}
        {written && a?.aiMarks !== null && a?.aiMarks !== undefined && (
          <div className={`rounded-2xl border p-4 text-sm ${flagged ? "border-danger-line bg-danger-soft" : "border-line bg-surface-2"}`}>
            <p className="font-semibold">AI suggestion: {a.aiMarks} / {q.marks} <span className="font-normal text-muted">({a.aiModel})</span></p>
            <p className="mt-1">{a.aiReason}</p>
            {!locked && !flagged && a.manualMarks === null && (
              <button type="button" disabled={busy} onClick={() => { setMarks(String(a.aiMarks)); save(String(a.aiMarks)); }} className="mt-2 text-sm font-semibold text-brand underline">Use this mark</button>
            )}
          </div>
        )}
        {!locked && a && (written ? a.textAnswer?.trim() : true) && (
          <div className="flex flex-wrap items-end gap-3 border-t border-line pt-4">
            <label className="text-sm">
              <span className="mb-1 block font-semibold">{written ? "Mark" : "Override mark"}</span>
              <input type="number" min={0} max={q.marks} step={0.25} value={marks} onChange={(e) => setMarks(e.target.value)} placeholder={written ? "" : String(a.autoMarks ?? "")}
                className="w-28 rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]" />
            </label>
            <label className="min-w-56 flex-1 text-sm">
              <span className="mb-1 block font-semibold">Feedback to candidate (optional)</span>
              <input value={feedback} maxLength={2000} onChange={(e) => setFeedback(e.target.value)}
                className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]" />
            </label>
            <button type="button" className={btn.primary} disabled={busy} onClick={() => save(marks)}>{busy ? "Saving…" : "Save mark"}</button>
            {!written && a.manualMarks !== null && <button type="button" className={btn.secondary} disabled={busy} onClick={() => save(null)}>Use automatic mark</button>}
          </div>
        )}
        {!written && <p className="text-xs text-muted">Automatic mark: {a?.autoMarks ?? 0}{a?.manualMarks !== null && a?.manualMarks !== undefined ? ` · overridden to ${a.manualMarks}` : ""}</p>}
        {msg && <FormAlert tone={msg.tone}>{msg.text}</FormAlert>}
      </div>
    </article>
  );
}
