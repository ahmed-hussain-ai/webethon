"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { ExamDetail } from "@/lib/exams/service";
import { DIFFICULTIES, DIFFICULTY_LABEL, QUESTION_TYPES, TYPE_LABEL } from "@/lib/validation/questions";
import { DifficultyBadge, TypeBadge } from "@/components/badges";
import { FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";
import { useConfirm } from "@/components/confirm-dialog";

type Item = ExamDetail["questions"][number];
type Category = { id: string; name: string };
type BankItem = {
  id: string; type: Item["type"]; text: string; difficulty: Item["difficulty"]; marks: number;
  category: Category; optionCount: number; isActive: boolean;
};

const selectCls = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]";
const numCls = "w-20 rounded-lg border border-line bg-surface px-2 py-1.5 text-right font-mono text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)] disabled:opacity-60";
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Live breakdown so the examiner always sees the paper's difficulty mix. */
function Breakdown({ items }: { items: Item[] }) {
  const total = items.reduce((s, i) => s + (Number(i.marks) || 0), 0);
  const byDiff = DIFFICULTIES.map((d) => {
    const qs = items.filter((i) => i.difficulty === d);
    return { d, count: qs.length, marks: qs.reduce((s, i) => s + (Number(i.marks) || 0), 0) };
  });
  const byType = QUESTION_TYPES.map((t) => ({ t, count: items.filter((i) => i.type === t).length })).filter((x) => x.count);
  const cats = [...new Map(items.map((i) => [i.category.id, i.category.name])).values()];
  const color = { EASY: "bg-success", MEDIUM: "bg-[#c99a3d]", HARD: "bg-danger" } as const;
  return (
    <div className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="eyebrow text-muted">Difficulty mix</p>
        <p className="font-mono text-xs text-muted">{items.length} questions · {r2(total)} marks</p>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full bg-line" role="img" aria-label={byDiff.map((b) => `${DIFFICULTY_LABEL[b.d]} ${b.count}`).join(", ")}>
        {byDiff.map((b) => b.count > 0 && <span key={b.d} className={color[b.d]} style={{ width: `${(b.count / Math.max(1, items.length)) * 100}%` }} />)}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {byDiff.map((b) => (
          <li key={b.d} className="flex items-center gap-1.5">
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${color[b.d]}`} />
            <strong>{b.count}</strong> {DIFFICULTY_LABEL[b.d]} <span className="text-muted">({r2(b.marks)} marks)</span>
          </li>
        ))}
      </ul>
      {items.length > 0 && (
        <p className="text-xs text-muted">
          {byType.map((x) => `${x.count} ${TYPE_LABEL[x.t].toLowerCase()}`).join(" · ")} · Categories: {cats.join(", ")}
        </p>
      )}
    </div>
  );
}

function BankPicker({ categories, addedIds, onAdd }: { categories: Category[]; addedIds: Set<string>; onAdd: (q: BankItem) => void }) {
  const [filters, setFilters] = useState({ q: "", category: "", type: "", difficulty: "", page: 1 });
  const [data, setData] = useState<{ items: BankItem[]; pages: number; total: number } | null>(null);
  const [error, setError] = useState<string>();

  useEffect(() => {
    const ctrl = new AbortController();
    const p = new URLSearchParams({ status: "active", page: String(filters.page) });
    for (const k of ["q", "category", "type", "difficulty"] as const) if (filters[k]) p.set(k, filters[k]);
    const t = setTimeout(() => {
      fetch(`/api/questions?${p}`, { signal: ctrl.signal })
        .then(async (r) => (r.ok ? r.json() : Promise.reject((await r.json().catch(() => null))?.error?.message)))
        .then((d) => { setData(d); setError(undefined); })
        .catch((e) => { if (!ctrl.signal.aborted) setError(typeof e === "string" ? e : "Couldn't load the bank. Check your connection."); });
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [filters]);

  const upd = (k: keyof typeof filters, v: string) => setFilters((f) => ({ ...f, [k]: v, page: 1 }));
  return (
    <div className="space-y-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <input aria-label="Search the bank" placeholder="Search question text…" value={filters.q} onChange={(e) => upd("q", e.target.value)} className={`${selectCls} sm:col-span-2`} />
        <select aria-label="Category" value={filters.category} onChange={(e) => upd("category", e.target.value)} className={selectCls}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select aria-label="Difficulty" value={filters.difficulty} onChange={(e) => upd("difficulty", e.target.value)} className={selectCls}>
          <option value="">Any difficulty</option>
          {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
        </select>
        <select aria-label="Type" value={filters.type} onChange={(e) => upd("type", e.target.value)} className={`${selectCls} sm:col-span-2`}>
          <option value="">All types</option>
          {QUESTION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
      </div>
      {error && <FormAlert>{error}</FormAlert>}
      {!data ? (
        <p className="py-6 text-center text-sm text-muted">Loading the bank…</p>
      ) : data.items.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted">No active questions match. <Link href="/questions/new" className="font-semibold text-brand underline">Create one</Link></p>
      ) : (
        <ul className="max-h-[28rem] divide-y divide-[var(--border)] overflow-y-auto rounded-2xl border border-line">
          {data.items.map((q) => {
            const added = addedIds.has(q.id);
            return (
              <li key={q.id} className="flex items-start gap-3 bg-surface px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm">{q.text}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1">
                    <TypeBadge type={q.type} /><DifficultyBadge difficulty={q.difficulty} />
                    <span className="text-xs text-muted">· {q.category.name} · {q.marks} marks</span>
                  </div>
                </div>
                <button
                  type="button" disabled={added} onClick={() => onAdd(q)}
                  aria-label={added ? "Already in the exam" : `Add: ${q.text.slice(0, 60)}`}
                  className="shrink-0 rounded-full border border-line px-3 py-1 text-xs font-bold text-brand transition hover:border-brand disabled:border-transparent disabled:text-success"
                >
                  {added ? "✓ Added" : "+ Add"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {data && data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button type="button" className="font-semibold text-brand disabled:text-muted" disabled={filters.page <= 1} onClick={() => setFilters((f) => ({ ...f, page: f.page - 1 }))}>← Prev</button>
          <span className="font-mono text-xs text-muted">Page {filters.page} / {data.pages}</span>
          <button type="button" className="font-semibold text-brand disabled:text-muted" disabled={filters.page >= data.pages} onClick={() => setFilters((f) => ({ ...f, page: f.page + 1 }))}>Next →</button>
        </div>
      )}
    </div>
  );
}

type Rule = { key: number; categoryId: string; difficulty: string; type: string; count: string };
let ruleKey = 1;

function RandomPicker({ examId, categories, excludeIds, onAdd }: { examId: string; categories: Category[]; excludeIds: string[]; onAdd: (qs: Item[]) => void }) {
  const [rules, setRules] = useState<Rule[]>([{ key: ruleKey++, categoryId: "", difficulty: "EASY", type: "", count: "3" }]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "error" | "notice"; text: string }>();
  const upd = (key: number, k: keyof Rule, v: string) => setRules((rs) => rs.map((r) => (r.key === key ? { ...r, [k]: v } : r)));

  async function pick() {
    setBusy(true);
    setMsg(undefined);
    try {
      const res = await fetch(`/api/exams/${examId}/random-pick`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          excludeIds,
          rules: rules.map((r) => ({ categoryId: r.categoryId || null, difficulty: r.difficulty || null, type: r.type || null, count: Number(r.count) })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        const f = json?.error?.fields;
        setMsg({ tone: "error", text: f ? Object.values(f).join(" ") : json?.error?.message ?? "Something went wrong" });
      } else {
        onAdd(json.questions);
        setMsg({ tone: "notice", text: `Added ${json.questions.length} random question(s). Review them, then save.` });
      }
    } catch {
      setMsg({ tone: "error", text: "Can't reach the server. Try again." });
    }
    setBusy(false);
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted">Pick questions at random by category, difficulty and type. Questions already in the exam are never picked twice.</p>
      <ol className="space-y-2">
        {rules.map((r, i) => (
          <li key={r.key} className="space-y-2 rounded-2xl border border-line bg-surface-2 p-3">
            <div className="flex items-center justify-between">
              <span className="eyebrow text-muted">Rule {i + 1}</span>
              <button type="button" aria-label={`Remove rule ${i + 1}`} disabled={rules.length === 1} onClick={() => setRules((rs) => rs.filter((x) => x.key !== r.key))} className="rounded-lg px-2 py-0.5 text-muted hover:text-danger disabled:opacity-30">✕</button>
            </div>
            <div className="grid grid-cols-[80px_1fr] gap-2">
              <input aria-label={`Rule ${i + 1}: how many`} type="number" min={1} max={50} value={r.count} onChange={(e) => upd(r.key, "count", e.target.value)} className={`${selectCls} font-mono`} />
              <select aria-label={`Rule ${i + 1}: difficulty`} value={r.difficulty} onChange={(e) => upd(r.key, "difficulty", e.target.value)} className={selectCls}>
                <option value="">Any difficulty</option>
                {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select aria-label={`Rule ${i + 1}: category`} value={r.categoryId} onChange={(e) => upd(r.key, "categoryId", e.target.value)} className={selectCls}>
                <option value="">Any category</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select aria-label={`Rule ${i + 1}: type`} value={r.type} onChange={(e) => upd(r.key, "type", e.target.value)} className={selectCls}>
                <option value="">Any type</option>
                {QUESTION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
              </select>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={btn.secondary} disabled={rules.length >= 10} onClick={() => setRules((rs) => [...rs, { key: ruleKey++, categoryId: "", difficulty: "", type: "", count: "1" }])}>+ Add rule</button>
        <button type="button" className={btn.primary} disabled={busy} onClick={pick}>{busy ? "Picking…" : "Pick at random"}</button>
      </div>
      {msg && <FormAlert tone={msg.tone}>{msg.text}</FormAlert>}
    </div>
  );
}

export function QuestionBuilder({ exam, categories }: { exam: ExamDetail; categories: Category[] }) {
  const router = useRouter();
  const { ask, dialog } = useConfirm();
  const editable = exam.canEditQuestions;
  const [items, setItems] = useState<Item[]>(exam.questions);
  const [mode, setMode] = useState<"bank" | "random">("bank");
  const [saving, setSaving] = useState(false);
  const [alert, setAlert] = useState<{ tone: "error" | "notice"; text: string; reload?: boolean }>();

  const savedKey = JSON.stringify(exam.questions.map((q) => [q.questionId, q.marks, q.negativeMarks]));
  const dirty = JSON.stringify(items.map((q) => [q.questionId, Number(q.marks), Number(q.negativeMarks)])) !== savedKey;
  const addedIds = useMemo(() => new Set(items.map((i) => i.questionId)), [items]);
  const total = r2(items.reduce((s, i) => s + (Number(i.marks) || 0), 0));

  // Warn before leaving with unsaved changes.
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => e.preventDefault();
    // In-app links (tabs, nav) don't fire beforeunload: ask before following them.
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey) return;
      if (a.origin !== window.location.origin || a.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      const href = a.pathname + a.search + a.hash;
      void ask({ title: "Leave without saving?", body: "You have unsaved changes to the questions. They will be lost if you leave this page.", action: "Leave without saving", danger: true })
        .then((leave) => { if (leave) { window.removeEventListener("beforeunload", h); router.push(href); } });
    };
    window.addEventListener("beforeunload", h);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", h); document.removeEventListener("click", onClick, true); };
  }, [dirty, ask, router]);

  const rowErrors = (i: Item) => {
    const m = Number(i.marks), n = Number(i.negativeMarks);
    if (!(m > 0)) return "Marks must be greater than 0";
    if (m > 1000) return "Marks can be at most 1000";
    if (n < 0) return "Negative marks cannot be below 0";
    if (n > m) return "Negative marks cannot exceed the question's marks";
    return null;
  };
  const invalid = items.some((i) => rowErrors(i));

  function addFromBank(q: BankItem) {
    if (addedIds.has(q.id)) return;
    setItems((xs) => [...xs, {
      questionId: q.id, type: q.type, text: q.text, difficulty: q.difficulty, defaultMarks: q.marks, marks: q.marks,
      negativeMarks: 0, isActive: q.isActive, category: q.category, optionCount: q.optionCount,
    }]);
  }
  const move = (idx: number, d: -1 | 1) =>
    setItems((xs) => {
      const j = idx + d;
      if (j < 0 || j >= xs.length) return xs;
      const c = [...xs];
      [c[idx], c[j]] = [c[j], c[idx]];
      return c;
    });
  const patch = (id: string, k: "marks" | "negativeMarks", v: string) =>
    setItems((xs) => xs.map((x) => (x.questionId === id ? { ...x, [k]: v as unknown as number } : x)));

  async function save() {
    if (saving || invalid) return;
    setSaving(true);
    setAlert(undefined);
    try {
      const res = await fetch(`/api/exams/${exam.id}/questions`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          updatedAt: exam.updatedAt,
          items: items.map((i) => ({ questionId: i.questionId, marks: Number(i.marks), negativeMarks: i.type === "WRITTEN" ? 0 : Number(i.negativeMarks) || 0 })),
        }),
      });
      const json = await res.json().catch(() => null);
      if (res.ok) {
        setAlert({ tone: "notice", text: "Questions saved." });
        router.refresh();
      } else {
        const f = json?.error?.fields;
        setAlert({ tone: json?.error?.code === "EDIT_CONFLICT" ? "notice" : "error", text: f ? Object.values(f).join(" ") : json?.error?.message ?? "Something went wrong", reload: json?.error?.code === "EDIT_CONFLICT" });
      }
    } catch {
      setAlert({ tone: "error", text: "Can't reach the server. Your changes are still here; try again." });
    }
    setSaving(false);
  }

  return (
    <>
    {dialog}
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <section aria-labelledby="paper-title" className="space-y-4">
        {!editable && (
          <FormAlert tone="notice">
            The question list is locked because the exam is published.{" "}
            {exam.canUnpublish ? <>Unpublish it from <Link className="font-semibold underline" href={`/exams/${exam.id}/review`}>Review</Link> to make changes.</> : "It has already opened, so the paper is final."}
          </FormAlert>
        )}
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="paper-title" className="font-display text-2xl">Exam paper</h2>
            <p className={`mt-1 font-mono text-sm ${total === exam.totalMarks ? "text-success" : "text-muted"}`}>
              {editable
                ? <>{total} marks{total === exam.totalMarks ? " ✓ matches the exam total" : total > 0 ? ` · exam total will change from ${exam.totalMarks} to ${total} when you save` : ""}</>
                : <>{total} of {exam.totalMarks} marks assigned{total === exam.totalMarks ? " ✓" : ""}</>}
            </p>
          </div>
          {editable && (
            <div className="flex items-center gap-3">
              {dirty && <span className="text-xs font-semibold text-danger" role="status">Unsaved changes</span>}
              <button type="button" onClick={save} disabled={!dirty || saving || invalid} className={btn.primary}>{saving ? "Saving…" : "Save questions"}</button>
            </div>
          )}
        </div>
        {alert && (
          <FormAlert tone={alert.tone}>
            {alert.text}
            {alert.reload && <button type="button" className="ml-2 font-semibold underline" onClick={() => location.reload()}>Reload now</button>}
          </FormAlert>
        )}
        <Breakdown items={items} />
        {items.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-muted">
            No questions yet. Add them from the bank or pick at random →
          </div>
        ) : (
          <ol className="space-y-2.5">
            {items.map((q, i) => {
              const err = rowErrors(q);
              return (
                <li key={q.questionId} className={`rounded-2xl border bg-surface p-3.5 ${!q.isActive ? "border-danger-line" : err ? "border-danger" : "border-line"}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-surface-2 font-mono text-xs font-bold">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="line-clamp-2 text-sm font-medium">{q.text}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1">
                        <TypeBadge type={q.type} /><DifficultyBadge difficulty={q.difficulty} />
                        <span className="text-xs text-muted">· {q.category.name}{q.optionCount ? ` · ${q.optionCount} options` : ""}</span>
                        {!q.isActive && <span className="text-xs font-bold text-danger">· Deactivated: remove it</span>}
                      </div>
                    </div>
                    {editable && (
                      <div className="flex shrink-0 gap-0.5">
                        <button type="button" aria-label={`Move question ${i + 1} up`} disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg px-2 py-1 text-muted hover:bg-surface-2 disabled:opacity-30">↑</button>
                        <button type="button" aria-label={`Move question ${i + 1} down`} disabled={i === items.length - 1} onClick={() => move(i, 1)} className="rounded-lg px-2 py-1 text-muted hover:bg-surface-2 disabled:opacity-30">↓</button>
                        <button type="button" aria-label={`Remove question ${i + 1}`} onClick={() => setItems((xs) => xs.filter((x) => x.questionId !== q.questionId))} className="rounded-lg px-2 py-1 text-muted hover:bg-danger-soft hover:text-danger">✕</button>
                      </div>
                    )}
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 pl-10 text-xs text-muted">
                    <label className="flex items-center gap-2">
                      Marks
                      <input type="number" min={0.01} max={1000} step={0.01} value={q.marks} disabled={!editable} onChange={(e) => patch(q.questionId, "marks", e.target.value)} className={numCls} aria-invalid={!!err} />
                    </label>
                    {q.type !== "WRITTEN" ? (
                      <label className="flex items-center gap-2">
                        Negative marks
                        <input type="number" min={0} step={0.25} value={q.negativeMarks} disabled={!editable} onChange={(e) => patch(q.questionId, "negativeMarks", e.target.value)} className={numCls} />
                      </label>
                    ) : (
                      <span>No negative marking for written answers</span>
                    )}
                    {Number(q.marks) !== q.defaultMarks && <span>Bank default: {q.defaultMarks}</span>}
                  </div>
                  {err && <p className="mt-2 pl-10 text-xs font-medium text-danger">● {err}</p>}
                </li>
              );
            })}
          </ol>
        )}
      </section>

      {editable && (
        <aside aria-label="Add questions" className="h-fit space-y-4 rounded-3xl border border-line bg-surface p-4 xl:sticky xl:top-4">
          <div role="tablist" aria-label="How to add questions" className="grid grid-cols-2 gap-1 rounded-2xl bg-surface-2 p-1">
            {(["bank", "random"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)}
                className={`rounded-xl px-3 py-2 text-sm font-semibold transition ${mode === m ? "bg-brand text-on-brand" : "text-muted hover:text-ink"}`}>
                {m === "bank" ? "Browse bank" : "Random pick"}
              </button>
            ))}
          </div>
          {mode === "bank" ? (
            <BankPicker categories={categories} addedIds={addedIds} onAdd={addFromBank} />
          ) : (
            <RandomPicker examId={exam.id} categories={categories} excludeIds={[...addedIds]} onAdd={(qs) => setItems((xs) => [...xs, ...qs.filter((q) => !addedIds.has(q.questionId))])} />
          )}
        </aside>
      )}
    </div>
    </>
  );
}
