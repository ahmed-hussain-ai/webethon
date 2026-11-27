"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";
import { LocalTime } from "@/components/local-time";

const CATS = [["GRADING_ERROR", "Marking error"], ["AMBIGUOUS_QUESTION", "Ambiguous or incorrect question"], ["TECHNICAL_ISSUE", "Technical problem during the exam"], ["OTHER", "Other"]] as const;
const STATUS: Record<string, [string, string]> = {
  OPEN: ["Submitted", "bg-notice"], UNDER_REVIEW: ["Under review", "bg-notice"],
  ACCEPTED: ["Accepted", "bg-success-soft text-success"], REJECTED: ["Not accepted", "bg-danger-soft text-danger"],
};
type D = { id: string; attemptQuestionId: string | null; category: string; description: string; status: string; resolutionNote: string | null; marksBefore: number | null; marksAfter: number | null; scoreBefore: number | null; scoreAfter: number | null; createdAt: string };

/** Candidate side of dispute resolution (5.4): raise within the window, follow the outcome. */
export function CandidateDisputes({ attemptId, questions }: { attemptId: string; questions: { id: string; number: number }[] }) {
  const [data, setData] = useState<{ openUntil: string | null; canRaise: boolean; disputes: D[] } | null>(null);
  const [form, setForm] = useState({ attemptQuestionId: "", category: "GRADING_ERROR", description: "" });
  const [msg, setMsg] = useState<{ tone: "error" | "notice"; text: string }>();
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const qNum = (id: string | null) => (id ? `Question ${questions.find((q) => q.id === id)?.number ?? "?"}` : "Whole result");

  const load = useCallback(() => fetch(`/api/my/results/${attemptId}/disputes`).then((r) => r.json()).then(setData).catch(() => {}), [attemptId]);
  useEffect(() => { load(); }, [load]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (form.description.trim().length < 10) return setMsg({ tone: "error", text: "Explain the problem in at least 10 characters." });
    setBusy(true);
    setMsg(undefined);
    const r = await fetch(`/api/my/results/${attemptId}/disputes`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attemptQuestionId: form.attemptQuestionId || null, category: form.category, description: form.description }),
    }).catch(() => null);
    const j = await r?.json().catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg({ tone: "error", text: j?.error?.fields ? Object.values(j.error.fields).join(" ") : j?.error?.message ?? "Couldn't send. Try again." });
    setMsg({ tone: "notice", text: "Dispute sent. Your examiner will review it; you'll see the outcome here." });
    setForm({ attemptQuestionId: "", category: "GRADING_ERROR", description: "" });
    setOpen(false);
    load();
  }

  if (!data) return null;
  return (
    <section aria-labelledby="disp-title" className="space-y-4 rounded-3xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="disp-title" className="font-display text-2xl">Disputes</h2>
          <p className="text-sm text-muted">
            {data.openUntil && data.canRaise ? <>Think a mark is wrong or a question was unclear? You can raise a dispute until <LocalTime iso={data.openUntil} />.</>
              : data.openUntil ? "The dispute window has closed or the limit is reached." : "Disputes open once results are published."}
          </p>
        </div>
        {data.canRaise && !open && <button type="button" className={btn.secondary} onClick={() => setOpen(true)}>Raise a dispute</button>}
      </div>
      {open && (
        <form onSubmit={submit} className="grid gap-3 rounded-2xl border border-line bg-surface-2 p-4 sm:grid-cols-2">
          <label className="text-sm"><span className="mb-1 block font-semibold">About</span>
            <select value={form.attemptQuestionId} onChange={(e) => setForm({ ...form, attemptQuestionId: e.target.value })} className="w-full rounded-xl border border-line bg-surface px-3 py-2">
              <option value="">The whole result</option>
              {questions.map((q) => <option key={q.id} value={q.id}>Question {q.number}</option>)}
            </select>
          </label>
          <label className="text-sm"><span className="mb-1 block font-semibold">Reason</span>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} className="w-full rounded-xl border border-line bg-surface px-3 py-2">
              {CATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="text-sm sm:col-span-2"><span className="mb-1 block font-semibold">Explain the problem</span>
            <textarea rows={4} maxLength={2000} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="e.g. My answer covers both points in the correct answer, but I received 2/10."
              className="w-full rounded-xl border border-line bg-surface p-3 focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]" />
          </label>
          <div className="flex gap-2 sm:col-span-2">
            <button className={btn.primary} disabled={busy}>{busy ? "Sending…" : "Send dispute"}</button>
            <button type="button" className={btn.secondary} onClick={() => setOpen(false)}>Cancel</button>
          </div>
        </form>
      )}
      {msg && <FormAlert tone={msg.tone}>{msg.text}</FormAlert>}
      {data.disputes.length > 0 && (
        <ul className="space-y-2">
          {data.disputes.map((d) => {
            const [label, cls] = STATUS[d.status];
            return (
              <li key={d.id} className="rounded-2xl border border-line p-4 text-sm">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{qNum(d.attemptQuestionId)} · {CATS.find((c) => c[0] === d.category)?.[1]}</p>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${cls}`}>{label}</span>
                </div>
                <p className="mt-1 text-muted">{d.description}</p>
                {d.resolutionNote && <p className="mt-2 rounded-xl bg-surface-2 p-3"><strong>Examiner&apos;s response:</strong> {d.resolutionNote}</p>}
                {d.status === "ACCEPTED" && d.scoreBefore !== null && d.scoreAfter !== null && d.scoreAfter !== d.scoreBefore && (
                  <p className="mt-2 font-semibold text-success">Your score changed from {d.scoreBefore} to {d.scoreAfter}.</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
