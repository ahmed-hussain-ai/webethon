"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useMemo, useState, type FormEvent } from "react";
import {
  DIFFICULTIES, DIFFICULTY_LABEL, MAX_OPTIONS, MIN_OPTIONS, QUESTION_TYPES, TYPE_LABEL,
  questionInputSchema,
} from "@/lib/validation/questions";
import { FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";

type QType = (typeof QUESTION_TYPES)[number];
type Diff = (typeof DIFFICULTIES)[number];
type Opt = { key: number; text: string; isCorrect: boolean };

export type QuestionFormInitial = {
  id: string;
  type: QType;
  categoryId: string;
  difficulty: Diff;
  marks: number;
  text: string;
  modelAnswer: string | null;
  explanation: string | null;
  options: { text: string; isCorrect: boolean }[];
  updatedAt: string;
};

const LETTERS = "ABCDEFGHIJ";
const inputCls =
  "w-full rounded-xl border bg-surface-2 px-3.5 py-2.5 text-[0.95rem] text-ink placeholder:text-muted/70 transition focus:bg-surface focus:outline-none focus:ring-4 focus:ring-[var(--ring)] disabled:opacity-70";
const errCls = (e?: string) => (e ? "border-danger" : "border-line focus:border-brand");

let nextKey = 1;
const newOpt = (text = "", isCorrect = false): Opt => ({ key: nextKey++, text, isCorrect });

function Err({ id, msg }: { id: string; msg?: string }) {
  if (!msg) return null;
  return (
    <p id={id} className="mt-1.5 flex items-start gap-1.5 text-xs font-medium text-danger">
      <span aria-hidden>●</span>
      {msg}
    </p>
  );
}

function Choice<T extends string>(props: {
  label: string; name: string; value: T; options: readonly T[]; labels: Record<T, string>;
  onChange: (v: T) => void; disabled?: boolean; hint?: string;
}) {
  return (
    <fieldset disabled={props.disabled}>
      <legend className="mb-1.5 block text-sm font-semibold">{props.label}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-2xl border border-line bg-surface-2 p-1">
        {props.options.map((o) => (
          <label
            key={o}
            className={`cursor-pointer rounded-xl px-3.5 py-1.5 text-sm font-semibold transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--ring)] ${
              props.value === o ? "bg-brand text-on-brand" : "text-muted hover:text-ink"
            } ${props.disabled ? "cursor-not-allowed opacity-70" : ""}`}
          >
            <input type="radio" name={props.name} value={o} checked={props.value === o} onChange={() => props.onChange(o)} className="sr-only" />
            {props.labels[o]}
          </label>
        ))}
      </div>
      {props.hint && <p className="mt-1.5 text-xs text-muted">{props.hint}</p>}
    </fieldset>
  );
}

export function QuestionForm({
  categories, initial, readOnly = false, typeLocked = false,
}: {
  categories: { id: string; name: string }[];
  initial?: QuestionFormInitial;
  readOnly?: boolean;
  typeLocked?: boolean;
}) {
  const router = useRouter();
  const uid = useId();
  const [type, setType] = useState<QType>(initial?.type ?? "SINGLE_CHOICE");
  const [categoryId, setCategoryId] = useState(initial?.categoryId ?? "");
  const [difficulty, setDifficulty] = useState<Diff>(initial?.difficulty ?? "MEDIUM");
  const [marks, setMarks] = useState(initial ? String(initial.marks) : "1");
  const [text, setText] = useState(initial?.text ?? "");
  const [modelAnswer, setModelAnswer] = useState(initial?.modelAnswer ?? "");
  const [explanation, setExplanation] = useState(initial?.explanation ?? "");
  const [options, setOptions] = useState<Opt[]>(() =>
    initial?.options.length ? initial.options.map((o) => newOpt(o.text, o.isCorrect)) : [newOpt(), newOpt(), newOpt(), newOpt()],
  );
  const [submitted, setSubmitted] = useState(false);
  const [serverFields, setServerFields] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<{ code: string; message: string } | null>(null);
  const [pending, setPending] = useState(false);

  const isChoice = type !== "WRITTEN";
  const payload = useMemo(
    () => ({
      type, categoryId, difficulty, marks, text, explanation,
      ...(type === "WRITTEN" ? { modelAnswer, options: [] } : { options: options.map(({ text, isCorrect }) => ({ text, isCorrect })) }),
    }),
    [type, categoryId, difficulty, marks, text, explanation, modelAnswer, options],
  );

  // Live client validation (same schema as the server). Shown after the first save attempt.
  const clientErrors = useMemo(() => {
    const r = questionInputSchema.safeParse(payload);
    const out: Record<string, string> = {};
    if (!r.success) for (const i of r.error.issues) out[i.path.join(".") || "_"] ??= i.message;
    return out;
  }, [payload]);
  const errors = submitted ? { ...serverFields, ...clientErrors } : serverFields;

  function changeType(t: QType) {
    setType(t);
    setServerFields({});
    if (t === "SINGLE_CHOICE") {
      // Keep at most one correct answer when switching from multi-select.
      let seen = false;
      setOptions((os) => os.map((o) => (o.isCorrect && !seen ? ((seen = true), o) : { ...o, isCorrect: false })));
    }
    if (t !== "WRITTEN") {
      setOptions((os) => (os.length >= MIN_OPTIONS ? os : [...os, ...Array.from({ length: MIN_OPTIONS - os.length }, () => newOpt())]));
    }
  }

  function setCorrect(key: number, checked: boolean) {
    setOptions((os) =>
      os.map((o) => (type === "SINGLE_CHOICE" ? { ...o, isCorrect: o.key === key } : o.key === key ? { ...o, isCorrect: checked } : o)),
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (pending || readOnly) return;
    setSubmitted(true);
    setAlert(null);
    setServerFields({});
    const parsed = questionInputSchema.safeParse(payload);
    if (!parsed.success) {
      setAlert({ code: "VALIDATION", message: "Please fix the highlighted fields." });
      return;
    }
    setPending(true);
    let res: Response;
    try {
      res = await fetch(initial ? `/api/questions/${initial.id}` : "/api/questions", {
        method: initial ? "PUT" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(initial ? { ...parsed.data, updatedAt: initial.updatedAt } : parsed.data),
      });
    } catch {
      setPending(false);
      setAlert({ code: "NETWORK", message: "Can't reach the server. Your changes are still here; try again." });
      return;
    }
    const json = await res.json().catch(() => null);
    if (res.ok) {
      router.push(`/questions/${json.id}?saved=1`);
      router.refresh();
      return;
    }
    setPending(false);
    const err = json?.error ?? { code: "ERROR", message: "Something went wrong" };
    if (err.fields) setServerFields(err.fields);
    setAlert(err);
  }

  const optionsError = errors["options"];
  const typeLabelsShort = { SINGLE_CHOICE: "Single choice", MULTI_SELECT: "Multiple select", WRITTEN: "Written" } as const;

  return (
    <form onSubmit={onSubmit} noValidate className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <fieldset disabled={readOnly || pending} className="min-w-0 space-y-6 rounded-3xl border border-line bg-surface p-5 sm:p-7">
        <legend className="sr-only">Question details</legend>
        {alert && (alert.code !== "VALIDATION" || Object.keys(clientErrors).length > 0) && (
          <FormAlert tone={alert.code === "EDIT_CONFLICT" ? "notice" : "error"}>
            {alert.message}
            {alert.code === "EDIT_CONFLICT" && (
              <button type="button" onClick={() => location.reload()} className="ml-2 font-semibold underline">
                Reload now
              </button>
            )}
          </FormAlert>
        )}

        <Choice
          label="Question type" name="type" value={type} options={QUESTION_TYPES} labels={typeLabelsShort}
          onChange={changeType} disabled={typeLocked}
          hint={typeLocked ? "Type can't change once the question is assigned to an exam." : undefined}
        />

        <div>
          <label htmlFor={`${uid}-text`} className="mb-1.5 block text-sm font-semibold">Question</label>
          <textarea
            id={`${uid}-text`} rows={4} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000}
            aria-invalid={!!errors.text} aria-describedby={errors.text ? `${uid}-text-err` : undefined}
            placeholder="Type the question exactly as candidates will see it…"
            className={`${inputCls} ${errCls(errors.text)} resize-y`}
          />
          <Err id={`${uid}-text-err`} msg={errors.text} />
        </div>

        <div className="grid gap-5 sm:grid-cols-[1fr_auto_140px]">
          <div>
            <label htmlFor={`${uid}-cat`} className="mb-1.5 block text-sm font-semibold">Category</label>
            <select
              id={`${uid}-cat`} value={categoryId} onChange={(e) => setCategoryId(e.target.value)}
              aria-invalid={!!errors.categoryId} className={`${inputCls} ${errCls(errors.categoryId)}`}
            >
              <option value="">Choose…</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Err id={`${uid}-cat-err`} msg={errors.categoryId} />
            {!categories.length && (
              <p className="mt-1.5 text-xs text-muted">
                No categories yet. <Link className="font-semibold text-brand underline" href="/categories">Create one</Link>
              </p>
            )}
          </div>
          <Choice label="Difficulty" name="difficulty" value={difficulty} options={DIFFICULTIES} labels={DIFFICULTY_LABEL} onChange={setDifficulty} />
          <div>
            <label htmlFor={`${uid}-marks`} className="mb-1.5 block text-sm font-semibold">Default marks</label>
            <input
              id={`${uid}-marks`} type="number" inputMode="decimal" min="0.01" max="1000" step="0.01"
              value={marks} onChange={(e) => setMarks(e.target.value)}
              aria-invalid={!!errors.marks} className={`${inputCls} ${errCls(errors.marks)} font-mono`}
            />
            <Err id={`${uid}-marks-err`} msg={errors.marks} />
          </div>
        </div>

        {isChoice ? (
          <fieldset>
            <legend className="mb-1 block text-sm font-semibold">
              Answer options &amp; correct answer <span className="text-danger" aria-hidden>*</span>
            </legend>
            <p className="mb-3 text-xs text-muted">
              {type === "SINGLE_CHOICE"
                ? "Select the one correct answer. It is used for automatic marking."
                : "Tick every correct answer. At least one option must be incorrect. Used for automatic marking."}{" "}
              {MIN_OPTIONS}–{MAX_OPTIONS} options.
            </p>
            {optionsError && <div className="mb-3"><FormAlert>{optionsError}</FormAlert></div>}
            <ol className="space-y-2.5">
              {options.map((o, i) => {
                const err = errors[`options.${i}.text`];
                return (
                  <li key={o.key}>
                    <div className={`flex items-center gap-2 rounded-2xl border p-1.5 pl-3 transition ${o.isCorrect ? "border-success/50 bg-success-soft" : "border-line bg-surface-2"}`}>
                      <label className="flex shrink-0 cursor-pointer items-center gap-2">
                        <input
                          type={type === "SINGLE_CHOICE" ? "radio" : "checkbox"} name={`${uid}-correct`}
                          checked={o.isCorrect} onChange={(e) => setCorrect(o.key, e.target.checked)}
                          className="h-4.5 w-4.5 accent-[var(--success)]"
                          aria-label={`Option ${LETTERS[i]} is correct`}
                        />
                        <span aria-hidden className="grid h-7 w-7 place-items-center rounded-lg bg-surface font-mono text-xs font-bold">{LETTERS[i]}</span>
                      </label>
                      <input
                        value={o.text} maxLength={1000}
                        onChange={(e) => setOptions((os) => os.map((x) => (x.key === o.key ? { ...x, text: e.target.value } : x)))}
                        placeholder={`Option ${LETTERS[i]}`} aria-label={`Option ${LETTERS[i]} text`} aria-invalid={!!err}
                        className={`min-w-0 flex-1 rounded-xl border bg-surface px-3 py-2 text-sm focus:outline-none focus:ring-4 focus:ring-[var(--ring)] ${err ? "border-danger" : "border-transparent focus:border-brand"}`}
                      />
                      {o.isCorrect && <span className="hidden text-xs font-bold text-success sm:inline">Correct</span>}
                      <button
                        type="button" onClick={() => setOptions((os) => os.filter((x) => x.key !== o.key))}
                        disabled={options.length <= MIN_OPTIONS} aria-label={`Remove option ${LETTERS[i]}`}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted transition hover:bg-danger-soft hover:text-danger disabled:pointer-events-none disabled:opacity-30"
                      >
                        ✕
                      </button>
                    </div>
                    <Err id={`${uid}-opt-${i}`} msg={err} />
                  </li>
                );
              })}
            </ol>
            <button
              type="button" onClick={() => setOptions((os) => [...os, newOpt()])} disabled={options.length >= MAX_OPTIONS}
              className="mt-3 text-sm font-semibold text-brand hover:underline disabled:text-muted disabled:no-underline"
            >
              + Add option {options.length >= MAX_OPTIONS && `(maximum ${MAX_OPTIONS})`}
            </button>
          </fieldset>
        ) : (
          <div>
            <label htmlFor={`${uid}-model`} className="mb-1.5 block text-sm font-semibold">
              Correct answer <span className="text-danger" aria-hidden>*</span>
            </label>
            <p id={`${uid}-model-hint`} className="mb-2 text-xs text-muted">
              The reference answer written answers are graded against. Include the key points a full-mark answer must cover.
              Never shown to candidates during the exam.
            </p>
            <textarea
              id={`${uid}-model`} rows={5} value={modelAnswer} onChange={(e) => setModelAnswer(e.target.value)} maxLength={5000}
              required aria-required="true" aria-invalid={!!errors.modelAnswer}
              aria-describedby={`${uid}-model-hint${errors.modelAnswer ? ` ${uid}-model-err` : ""}`}
              placeholder="e.g. INNER JOIN returns only rows with a match in both tables; LEFT JOIN returns every row of the left table…"
              className={`${inputCls} ${errCls(errors.modelAnswer)} resize-y`}
            />
            <Err id={`${uid}-model-err`} msg={errors.modelAnswer} />
          </div>
        )}

        <div>
          <label htmlFor={`${uid}-expl`} className="mb-1.5 block text-sm font-semibold">
            Explanation <span className="font-normal text-muted">(optional)</span>
          </label>
          <textarea
            id={`${uid}-expl`} rows={2} value={explanation} onChange={(e) => setExplanation(e.target.value)} maxLength={5000}
            className={`${inputCls} ${errCls(errors.explanation)} resize-y`}
          />
          <Err id={`${uid}-expl-err`} msg={errors.explanation} />
        </div>

        {!readOnly && (
          <div className="flex flex-wrap gap-3 border-t border-line pt-5">
            <button type="submit" className={btn.primary} disabled={pending} aria-busy={pending}>
              {pending && <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              {pending ? "Saving…" : initial ? "Save changes" : "Create question"}
            </button>
            <Link href={initial ? `/questions/${initial.id}` : "/questions"} className={btn.secondary}>Cancel</Link>
          </div>
        )}
      </fieldset>

      {/* Candidate preview: never shows which option is correct. */}
      <aside aria-label="Candidate preview" className="h-fit rounded-3xl border border-line bg-surface lg:sticky lg:top-6">
        <div className="header-band rounded-t-3xl px-5 py-4">
          <p className="eyebrow text-on-header-muted">Candidate preview</p>
          <p className="mt-1 font-mono text-sm">{TYPE_LABEL[type]} · {Number(marks) || 0} mark{Number(marks) === 1 ? "" : "s"}</p>
        </div>
        <div className="space-y-3 p-5">
          <p className="whitespace-pre-wrap break-words font-medium">{text || <span className="text-muted">Question text…</span>}</p>
          {isChoice ? (
            <ul className="space-y-2">
              {options.map((o, i) => (
                <li key={o.key} className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm">
                  <span aria-hidden className={`mt-0.5 h-4 w-4 shrink-0 border-2 border-line-strong ${type === "SINGLE_CHOICE" ? "rounded-full" : "rounded"}`} />
                  <span className="break-words">{o.text || <span className="text-muted">Option {LETTERS[i]}</span>}</span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="h-24 rounded-xl border border-dashed border-line-strong bg-surface-2 p-3 text-sm text-muted">Candidate types the answer here…</div>
          )}
          {type === "MULTI_SELECT" && <p className="text-xs text-muted">Candidates may select more than one answer.</p>}
        </div>
      </aside>
    </form>
  );
}
