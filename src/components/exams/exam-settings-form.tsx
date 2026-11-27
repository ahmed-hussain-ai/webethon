"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent, type ReactNode } from "react";
import type { ExamDetail } from "@/lib/exams/service";
import { examDetailsSchema, MULTI_RULE_LABEL, MULTI_SELECT_RULES } from "@/lib/validation/exams";
import { FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";
import { useMounted } from "@/components/local-time";

const inputCls =
  "w-full rounded-xl border bg-surface-2 px-3.5 py-2.5 text-[0.95rem] text-ink transition focus:bg-surface focus:outline-none focus:ring-4 focus:ring-[var(--ring)] disabled:cursor-not-allowed disabled:opacity-60";
const border = (e?: string) => (e ? "border-danger" : "border-line focus:border-brand");

// <input type="datetime-local"> works in the viewer's local time; the API always gets UTC ISO.
const toLocalInput = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const toIso = (local: string) => (local ? new Date(local).toISOString() : null);

function Row({ label, htmlFor, error, hint, children }: { label: string; htmlFor?: string; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-semibold">{label}</label>
      {children}
      {hint && !error && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
      {error && <p className="mt-1.5 text-xs font-medium text-danger">● {error}</p>}
    </div>
  );
}

function Toggle({ checked, onChange, label, description, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string; disabled?: boolean }) {
  return (
    <label className={`flex items-start gap-3 rounded-2xl border border-line bg-surface-2 p-4 ${disabled ? "opacity-60" : "cursor-pointer hover:border-brand"}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span aria-hidden className={`mt-0.5 flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition peer-focus-visible:ring-4 peer-focus-visible:ring-[var(--ring)] ${checked ? "bg-brand" : "bg-line-strong"}`}>
        <span className={`h-5 w-5 rounded-full bg-white shadow transition ${checked ? "translate-x-5" : ""}`} />
      </span>
      <span>
        <span className="block text-sm font-semibold">{label}</span>
        <span className="block text-xs text-muted">{description}</span>
      </span>
    </label>
  );
}

export function ExamSettingsForm({ exam }: { exam: ExamDetail }) {
  const router = useRouter();
  const uid = useId();
  const mounted = useMounted();
  const [f, setF] = useState(() => ({
    title: exam.title,
    description: exam.description ?? "",
    instructions: exam.instructions ?? "",
    startAt: toLocalInput(exam.startAt),
    endAt: toLocalInput(exam.endAt),
    durationMinutes: String(exam.durationMinutes),
    totalMarks: String(exam.totalMarks),
    passMarks: String(exam.passMarks),
    shuffleQuestions: exam.shuffleQuestions,
    shuffleOptions: exam.shuffleOptions,
    multiSelectRule: exam.multiSelectRule,
    autoCheckWritten: exam.autoCheckWritten,
  }));
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((p) => ({ ...p, [k]: v }));
  const [submitted, setSubmitted] = useState(false);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<{ tone: "error" | "notice"; text: string; reload?: boolean } | null>(null);
  const [pending, setPending] = useState(false);

  const ongoing = exam.phase === "ONGOING";
  const ended = exam.phase === "COMPLETED";
  const frozen = ongoing || ended; // schedule & marking settings locked once the window opens

  const payload = useMemo(() => ({ ...f, startAt: mounted ? toIso(f.startAt) : null, endAt: mounted ? toIso(f.endAt) : null }), [f, mounted]);
  const clientErrors = useMemo(() => {
    const r = examDetailsSchema.safeParse(payload);
    const out: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) out[String(i.path[0] ?? "_")] ??= i.message;
    return out;
  }, [payload]);
  const errors = submitted ? { ...serverFields, ...clientErrors } : serverFields;
  const tz = mounted ? Intl.DateTimeFormat().resolvedOptions().timeZone : "";

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || ended) return;
    setSubmitted(true);
    setServerFields({});
    setAlert(null);
    const parsed = examDetailsSchema.safeParse(payload);
    if (!parsed.success) return setAlert({ tone: "error", text: "Please fix the highlighted fields." });
    setPending(true);
    try {
      const res = await fetch(`/api/exams/${exam.id}`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, updatedAt: exam.updatedAt }),
      });
      const json = await res.json().catch(() => null);
      setPending(false);
      if (res.ok) {
        setSubmitted(false);
        setAlert({ tone: "notice", text: "Saved." });
        router.refresh();
        return;
      }
      const err = json?.error ?? { message: "Something went wrong" };
      if (err.fields) setServerFields(err.fields);
      setAlert({ tone: err.code === "EDIT_CONFLICT" ? "notice" : "error", text: err.message, reload: err.code === "EDIT_CONFLICT" });
    } catch {
      setPending(false);
      setAlert({ tone: "error", text: "Can't reach the server. Your changes are still here; try again." });
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {ended && <FormAlert tone="notice">This exam has ended. Its settings are kept for the record and can no longer change.</FormAlert>}
      {ongoing && <FormAlert tone="notice">The exam is in progress. Only the title, texts and an <strong>extension</strong> of the end time can change.</FormAlert>}
      {alert && (
        <FormAlert tone={alert.tone}>
          {alert.text}
          {alert.reload && <button type="button" className="ml-2 font-semibold underline" onClick={() => location.reload()}>Reload now</button>}
        </FormAlert>
      )}

      <fieldset disabled={ended || pending} className="grid gap-6 lg:grid-cols-2">
        <section className="space-y-5 rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="eyebrow text-muted">Details</h2>
          <Row label="Title" htmlFor={`${uid}-t`} error={errors.title}>
            <input id={`${uid}-t`} value={f.title} maxLength={200} onChange={(e) => set("title", e.target.value)} className={`${inputCls} ${border(errors.title)}`} />
          </Row>
          <Row label="Description (optional)" htmlFor={`${uid}-d`} error={errors.description}>
            <textarea id={`${uid}-d`} rows={2} value={f.description} maxLength={5000} onChange={(e) => set("description", e.target.value)} className={`${inputCls} ${border(errors.description)} resize-y`} />
          </Row>
          <Row label="Instructions for candidates (optional)" htmlFor={`${uid}-i`} error={errors.instructions} hint="Shown before the candidate starts.">
            <textarea id={`${uid}-i`} rows={5} value={f.instructions} maxLength={10000} onChange={(e) => set("instructions", e.target.value)} className={`${inputCls} ${border(errors.instructions)} resize-y`} />
          </Row>
        </section>

        <section className="space-y-5 rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="eyebrow text-muted">Schedule</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="Opens at" htmlFor={`${uid}-s`} error={errors.startAt}>
              <input id={`${uid}-s`} type="datetime-local" value={f.startAt} disabled={frozen || !mounted} onChange={(e) => set("startAt", e.target.value)} className={`${inputCls} ${border(errors.startAt)}`} />
            </Row>
            <Row label="Closes at" htmlFor={`${uid}-e`} error={errors.endAt} hint={ongoing ? "Can only be moved later." : undefined}>
              <input id={`${uid}-e`} type="datetime-local" value={f.endAt} disabled={ended || !mounted} min={ongoing ? toLocalInput(exam.endAt) : undefined} onChange={(e) => set("endAt", e.target.value)} className={`${inputCls} ${border(errors.endAt)}`} />
            </Row>
          </div>
          <Row label="Duration per candidate (minutes)" htmlFor={`${uid}-du`} error={errors.durationMinutes}
            hint="Each candidate gets this long from when they start, but never past the closing time. Late starters get less time.">
            <input id={`${uid}-du`} type="number" min={1} max={1440} inputMode="numeric" value={f.durationMinutes} disabled={frozen} onChange={(e) => set("durationMinutes", e.target.value)} className={`${inputCls} ${border(errors.durationMinutes)} font-mono`} />
          </Row>
          {tz && <p className="text-xs text-muted">Times are in your timezone ({tz}). The server clock decides when the exam opens and closes.</p>}
        </section>

        <section className="space-y-5 rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="eyebrow text-muted">Marking</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Row label="Total marks" htmlFor={`${uid}-tm`} error={errors.totalMarks} hint={`Questions currently add up to ${exam.assignedMarks}.`}>
              <div className="flex gap-2">
                <input id={`${uid}-tm`} type="number" min={0.01} step={0.01} inputMode="decimal" value={f.totalMarks} disabled={frozen} onChange={(e) => set("totalMarks", e.target.value)} className={`${inputCls} ${border(errors.totalMarks)} font-mono`} />
                {!frozen && exam.assignedMarks > 0 && Number(f.totalMarks) !== exam.assignedMarks && (
                  <button type="button" onClick={() => set("totalMarks", String(exam.assignedMarks))} className="shrink-0 rounded-xl border border-line px-3 text-xs font-semibold text-brand hover:border-brand">
                    Use {exam.assignedMarks}
                  </button>
                )}
              </div>
            </Row>
            <Row label="Pass marks" htmlFor={`${uid}-pm`} error={errors.passMarks}>
              <input id={`${uid}-pm`} type="number" min={0} step={0.01} inputMode="decimal" value={f.passMarks} disabled={frozen} onChange={(e) => set("passMarks", e.target.value)} className={`${inputCls} ${border(errors.passMarks)} font-mono`} />
            </Row>
          </div>
          <fieldset disabled={frozen}>
            <legend className="mb-2 block text-sm font-semibold">Multiple-select questions</legend>
            <div className="space-y-2">
              {MULTI_SELECT_RULES.map((r) => (
                <label key={r} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 text-sm ${f.multiSelectRule === r ? "border-brand bg-surface-2" : "border-line"}`}>
                  <input type="radio" name={`${uid}-ms`} checked={f.multiSelectRule === r} onChange={() => set("multiSelectRule", r)} className="mt-0.5 accent-[var(--brand)]" />
                  <span>{MULTI_RULE_LABEL[r]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <p className="rounded-2xl bg-surface-2 p-3 text-xs text-muted">
            Single-choice and multiple-select answers are <strong className="text-ink">always marked automatically</strong>.
            You review every result before publishing it.
          </p>
          <Toggle
            checked={f.autoCheckWritten} disabled={frozen} onChange={(v) => set("autoCheckWritten", v)}
            label="Auto-check written answers with AI"
            description="AI compares each written answer with your correct answer and suggests a mark. You review it before results are published. Off: you mark written answers yourself."
          />
        </section>

        <section className="space-y-3 rounded-3xl border border-line bg-surface p-5 sm:p-6">
          <h2 className="eyebrow text-muted">Paper</h2>
          <Toggle checked={f.shuffleQuestions} disabled={frozen} onChange={(v) => set("shuffleQuestions", v)}
            label="Shuffle question order" description="Each candidate gets the same questions in a different order." />
          <Toggle checked={f.shuffleOptions} disabled={frozen} onChange={(v) => set("shuffleOptions", v)}
            label="Shuffle answer options" description="Options of objective questions appear in a different order for each candidate. Marking is unaffected." />
        </section>
      </fieldset>

      {!ended && (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <button type="submit" className={`${btn.primary} shadow-lg`} disabled={pending} aria-busy={pending}>
            {pending ? "Saving…" : "Save settings"}
          </button>
        </div>
      )}
    </form>
  );
}
