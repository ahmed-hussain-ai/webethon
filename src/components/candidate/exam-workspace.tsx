"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Paper } from "@/lib/attempts/workspace";
import { Announcements, FullscreenGate, PrefsMenu, Scratchpad, useIntegrity, type Prefs } from "./workspace-extras";

type Q = Paper["questions"][number];
type Ans = { selectedOptionIds: string[]; textAnswer: string; markedForReview: boolean; seq: number };
type Pending = Ans & { attemptQuestionId: string };
type SaveState = "saved" | "saving" | "offline" | "error";

const LETTERS = "ABCDEFGHIJ";
const TEXT_DEBOUNCE_MS = 800;

function fmt(ms: number) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}` : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}
const isAnswered = (a?: Ans) => !!a && (a.selectedOptionIds.length > 0 || a.textAnswer.trim().length > 0);

/** Local copy of unsynced answers: survives refresh, crashes and offline periods on this device. */
function store(attemptId: string) {
  const key = `attempt:${attemptId}`;
  return {
    load(): { pending: Record<string, Pending>; seq: number } {
      try { return JSON.parse(localStorage.getItem(key) ?? "") ; } catch { return { pending: {}, seq: 0 }; }
    },
    save(pending: Record<string, Pending>, seq: number) {
      try { localStorage.setItem(key, JSON.stringify({ pending, seq })); } catch { /* storage full/blocked: server copy still works */ }
    },
    clear() { try { localStorage.removeItem(key); } catch { /* ignore */ } },
  };
}

const FONT = { SMALL: "0.9rem", MEDIUM: "1rem", LARGE: "1.15rem", XLARGE: "1.3rem" } as const;

export function ExamWorkspace({ paper, initialPrefs }: { paper: Paper; initialPrefs: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initialPrefs);
  const [scratchOpen, setScratchOpen] = useState(false);
  const { needFullscreen, enterFullscreen } = useIntegrity(paper.id, paper.exam.requireFullscreen, paper.questions.some((q) => q.answer));
  const local = useMemo(() => store(paper.id), [paper.id]);
  const offset = useRef(0); // server − device clock, measured on mount
  const deadline = useRef(Date.parse(paper.deadlineAt));
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<Record<string, Ans>>(() => {
    const out: Record<string, Ans> = {};
    for (const q of paper.questions) {
      out[q.id] = q.answer
        ? { selectedOptionIds: q.answer.selectedOptionIds, textAnswer: q.answer.textAnswer ?? "", markedForReview: q.answer.markedForReview, seq: q.answer.seq }
        : { selectedOptionIds: [], textAnswer: "", markedForReview: false, seq: 0 };
    }
    return out;
  });
  const pending = useRef<Record<string, Pending>>({});
  const seq = useRef(Math.max(0, ...paper.questions.map((q) => q.answer?.seq ?? 0)));
  const inflight = useRef(false);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const textTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backoff = useRef(1000);
  const finishing = useRef(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [pendingCount, setPendingCount] = useState(0);
  const [left, setLeft] = useState(() => Date.parse(paper.deadlineAt) - Date.parse(paper.serverNow));
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [done, setDone] = useState<null | { auto: boolean }>(null);
  const [submitError, setSubmitError] = useState<string>();
  const [announce, setAnnounce] = useState("");

  const finish = useCallback(async (auto: boolean) => {
    if (finishing.current) return;
    finishing.current = true;
    if (textTimer.current) clearTimeout(textTimer.current);
    const batch = Object.values(pending.current).map(({ attemptQuestionId, selectedOptionIds, textAnswer, markedForReview, seq }) => ({ attemptQuestionId, selectedOptionIds, textAnswer: textAnswer || null, markedForReview, seq }));
    try {
      const res = await fetch(`/api/my/attempts/${paper.id}/submit`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ answers: batch }) });
      if (!res.ok && res.status !== 409) throw new Error((await res.json().catch(() => null))?.error?.message ?? "Submit failed");
      local.clear();
      pending.current = {};
      setDone({ auto });
      setTimeout(() => window.location.replace(paper.isSandbox ? `/attempts/${paper.id}` : `/my-exams/${paper.exam.id}`), 2500);
    } catch (e) {
      finishing.current = false;
      if (auto) {
        // The server closes the attempt at the deadline anyway; answers saved before it count.
        setDone({ auto: true });
        setTimeout(() => window.location.replace(paper.isSandbox ? `/attempts/${paper.id}` : `/my-exams/${paper.exam.id}`), 4000);
      } else {
        setSubmitError(e instanceof Error && e.message !== "Failed to fetch" ? e.message : "Couldn't reach the server. Your answers are kept on this device; check your connection and try again.");
      }
    }
  }, [paper.id, paper.exam.id, paper.isSandbox, local]);

  const flushRef = useRef<() => void>(() => {});
  const flush = useCallback(async () => {
    if (inflight.current || finishing.current) return;
    const batch = Object.values(pending.current);
    if (!batch.length) { setSaveState(navigator.onLine ? "saved" : "offline"); return; }
    if (!navigator.onLine) { setSaveState("offline"); return; }
    inflight.current = true;
    setSaveState("saving");
    try {
      const res = await fetch(`/api/my/attempts/${paper.id}/answers`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: batch.map(({ attemptQuestionId, selectedOptionIds, textAnswer, markedForReview, seq }) => ({ attemptQuestionId, selectedOptionIds, textAnswer: textAnswer || null, markedForReview, seq })) }),
      });
      const json = await res.json().catch(() => null);
      if (res.status === 409 && json?.error?.code === "TIME_UP") { inflight.current = false; finish(true); return; }
      if (res.status === 401) { window.location.replace("/login"); return; }
      if (!res.ok) throw new Error(json?.error?.message ?? "save failed");
      // Drop what the server confirmed (a newer local edit made meanwhile stays pending).
      for (const s of json.saved as { attemptQuestionId: string; seq: number }[]) {
        const p = pending.current[s.attemptQuestionId];
        if (p && p.seq <= s.seq) delete pending.current[s.attemptQuestionId];
      }
      offset.current = Date.parse(json.serverNow) - Date.now(); // re-sync the clock
      deadline.current = Date.parse(json.deadlineAt); // picks up an extension
      local.save(pending.current, seq.current);
      backoff.current = 1000;
      setPendingCount(Object.keys(pending.current).length);
      inflight.current = false;
      if (Object.keys(pending.current).length) flushRef.current();
      else setSaveState("saved");
    } catch {
      inflight.current = false;
      setSaveState(navigator.onLine ? "error" : "offline");
      if (retryTimer.current) clearTimeout(retryTimer.current);
      retryTimer.current = setTimeout(() => flushRef.current(), backoff.current);
      backoff.current = Math.min(backoff.current * 2, 15000);
    }
  }, [paper.id, finish, local]);
  useEffect(() => { flushRef.current = flush; }, [flush]);

  // Restore unsynced answers from this device (newer than the server's copy) and send them.
  useEffect(() => {
    offset.current = Date.parse(paper.serverNow) - Date.now();
    const saved = local.load();
    seq.current = Math.max(seq.current, saved?.seq ?? 0);
    const restore: Record<string, Ans> = {};
    for (const [qid, p] of Object.entries(saved?.pending ?? {})) {
      if (p.seq > (answers[qid]?.seq ?? 0)) { pending.current[qid] = p; restore[qid] = p; }
    }
    if (Object.keys(restore).length) {
      setAnswers((a) => ({ ...a, ...restore })); // eslint-disable-line react-hooks/set-state-in-effect
      setPendingCount(Object.keys(pending.current).length);
      flush();
    }
    const on = () => { backoff.current = 1000; flush(); };
    const off = () => setSaveState("offline");
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    if (!navigator.onLine) off();
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); };
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Server-synced countdown + warnings + auto-submit at zero.
  useEffect(() => {
    const t = setInterval(() => {
      const ms = deadline.current - (Date.now() + offset.current);
      setLeft(ms);
      const s = Math.ceil(ms / 1000);
      if (s === 300) setAnnounce("5 minutes left");
      if (s === 60) setAnnounce("1 minute left");
      if (ms <= 0) finish(true);
    }, 500);
    return () => clearInterval(t);
  }, [finish]);

  // Warn before leaving with unsynced answers.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (Object.keys(pending.current).length) e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  function change(qid: string, patch: Partial<Ans>, debounce = false) {
    if (finishing.current) return;
    seq.current += 1;
    const next = { ...answers[qid], ...patch, seq: seq.current };
    setAnswers((a) => ({ ...a, [qid]: next }));
    pending.current[qid] = { ...next, attemptQuestionId: qid };
    local.save(pending.current, seq.current);
    setPendingCount(Object.keys(pending.current).length);
    setSaveState(navigator.onLine ? "saving" : "offline");
    if (textTimer.current) clearTimeout(textTimer.current);
    if (debounce) textTimer.current = setTimeout(flush, TEXT_DEBOUNCE_MS);
    else flush();
  }

  const q: Q = paper.questions[current];
  const a = answers[q.id];
  const counts = useMemo(() => {
    const vals = paper.questions.map((x) => answers[x.id]);
    return { answered: vals.filter(isAnswered).length, marked: vals.filter((v) => v.markedForReview).length, total: vals.length };
  }, [answers, paper.questions]);
  const lowTime = left <= 5 * 60_000;

  // Keyboard shortcuts (Alt so they never clash with typing): Alt+←/→ previous/next, Alt+R mark for review.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey || done) return;
      const n = paper.questions.length;
      if (e.key === "ArrowRight") { e.preventDefault(); setCurrent((c) => Math.min(n - 1, c + 1)); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); setCurrent((c) => Math.max(0, c - 1)); }
      else if (e.code === "KeyR") { e.preventDefault(); change(q.id, { markedForReview: !a.markedForReview }); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (done) {
    return (
      <div className="grid min-h-screen place-items-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-line bg-surface p-8 text-center" role="status">
          <p className="eyebrow text-muted">{done.auto ? "Time is up" : "Submitted"}</p>
          <h1 className="font-display mt-2 text-3xl">{done.auto ? "Your exam was submitted" : "Exam submitted"}</h1>
          <p className="mt-3 text-sm text-muted">Answers saved before the deadline are recorded. Taking you back…</p>
        </div>
      </div>
    );
  }

  const status = {
    saved: { text: "All answers saved", cls: "text-[#b6f2cb]", dot: "bg-[#4ade80]" },
    saving: { text: "Saving…", cls: "text-on-header-muted", dot: "bg-[#c99a3d] animate-pulse" },
    offline: { text: `Offline: ${pendingCount} answer${pendingCount === 1 ? "" : "s"} kept on this device`, cls: "text-[#f0c56a]", dot: "bg-[#f0c56a]" },
    error: { text: "Couldn't save, retrying…", cls: "text-[#ff9aa9]", dot: "bg-[#ff6b81] animate-pulse" },
  }[saveState];

  return (
    <div className={`flex min-h-screen flex-col ${prefs.highContrast ? "hc" : ""}`}>
      <header className="header-band sticky top-0 z-20 shadow-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <div className="min-w-0 flex-1 max-sm:basis-full">
            <p className="eyebrow text-on-header-muted">{paper.isSandbox ? <span className="whitespace-nowrap rounded bg-[#f0c56a] px-1.5 py-0.5 text-[#3a2a00]">Preview · not recorded</span> : "Exam in progress"}</p>
            <h1 className="truncate font-serif text-lg">{paper.exam.title}</h1>
          </div>
          <p role="status" aria-live="polite" className={`flex items-center gap-2 text-sm font-semibold max-sm:mr-auto ${status.cls}`}>
            <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${status.dot}`} />
            {status.text}
          </p>
          <div className={`rounded-2xl px-4 py-1.5 text-center ${lowTime ? "bg-[#ff6b81] text-white" : "bg-white/10"}`} aria-label={`Time left ${fmt(left)}`}>
            <p className="eyebrow text-[0.6rem] opacity-80">Time left</p>
            <p className="font-mono text-2xl font-bold tabular-nums" aria-hidden>{fmt(left)}</p>
          </div>
          <PrefsMenu prefs={prefs} onChange={setPrefs} />
        </div>
        {saveState === "offline" && (
          <p className="bg-[#f0c56a] px-4 py-2 text-center text-sm font-semibold text-[#3a2a00]">
            You are offline. Keep working: answers are kept on this device and will be sent when the connection returns. The timer keeps running.
          </p>
        )}
      </header>
      <Announcements attemptId={paper.id} />
      {needFullscreen && <FullscreenGate onEnter={enterFullscreen} />}
      <p className="sr-only" aria-live="assertive">{announce}</p>

      <div className={`mx-auto grid w-full max-w-7xl flex-1 gap-6 px-4 py-6 ${prefs.navPosition === "LEFT" ? "lg:grid-cols-[260px_1fr]" : prefs.navPosition === "RIGHT" ? "lg:grid-cols-[1fr_260px]" : ""}`}>
        <nav aria-label="Questions" className={`h-fit rounded-3xl border border-line bg-surface p-4 ${prefs.navPosition === "BOTTOM" ? "order-2" : "lg:sticky lg:top-28"} ${prefs.navPosition === "RIGHT" ? "lg:order-2" : ""}`}>
          <p className="mb-3 text-sm"><strong>{counts.answered}</strong> of {counts.total} answered{counts.marked ? <> · <strong>{counts.marked}</strong> to review</> : null}</p>
          <ol className={`grid gap-2 ${prefs.navPosition === "BOTTOM" ? "grid-cols-6 sm:grid-cols-10 lg:grid-cols-15" : "grid-cols-6 lg:grid-cols-5"}`}>
            {paper.questions.map((x, i) => {
              const s = answers[x.id];
              const ans = isAnswered(s);
              return (
                <li key={x.id}>
                  <button
                    type="button" onClick={() => setCurrent(i)} aria-current={i === current ? "step" : undefined}
                    aria-label={`Question ${i + 1}, ${ans ? "answered" : "not answered"}${s.markedForReview ? ", marked for review" : ""}`}
                    className={`relative grid aspect-square w-full place-items-center rounded-xl border-2 font-mono text-sm font-bold transition ${
                      ans ? "border-brand bg-brand text-on-brand" : "border-line-strong bg-surface-2 text-ink"
                    } ${i === current ? "ring-4 ring-[var(--ring)]" : ""}`}
                  >
                    {i + 1}
                    {s.markedForReview && <span aria-hidden className="absolute -top-1.5 -right-1.5 h-3.5 w-3.5 rounded-full border-2 border-surface bg-[#e0a030]" />}
                  </button>
                </li>
              );
            })}
          </ol>
          <ul className="mt-4 space-y-1.5 text-xs text-muted">
            <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 rounded bg-brand" /> Answered</li>
            <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 rounded border-2 border-line-strong bg-surface-2" /> Not answered</li>
            <li className="flex items-center gap-2"><span aria-hidden className="h-3 w-3 rounded-full bg-[#e0a030]" /> Marked for review</li>
          </ul>
          <button type="button" onClick={() => { setSubmitError(undefined); setConfirmOpen(true); }} className="mt-5 w-full rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-hover">
            Review &amp; submit
          </button>
        </nav>

        <main id="main" className={prefs.layout === "SPLIT" ? "grid gap-6 xl:grid-cols-[1fr_380px]" : ""}>
          <article aria-labelledby="q-title" className="h-fit rounded-3xl border border-line bg-surface" style={{ fontSize: FONT[prefs.fontSize] }}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-6 py-4">
              <p id="q-title" className="eyebrow text-muted">Question {current + 1} of {paper.questions.length}</p>
              <p className="font-mono text-sm">
                {q.marks} mark{q.marks === 1 ? "" : "s"}
                {q.negativeMarks > 0 && <span className="text-danger"> · −{q.negativeMarks} if wrong</span>}
              </p>
            </div>
            <div className="space-y-5 px-6 py-6">
              <p className="whitespace-pre-wrap break-words text-[1.15em] leading-relaxed">{q.text}</p>

              {q.type === "WRITTEN" ? (
                <div>
                  <label htmlFor={`ans-${q.id}`} className="mb-2 block text-sm font-semibold">Your answer</label>
                  <textarea
                    id={`ans-${q.id}`} rows={10} value={a.textAnswer} maxLength={20000}
                    onChange={(e) => change(q.id, { textAnswer: e.target.value }, true)}
                    className="w-full resize-y rounded-2xl border border-line bg-surface-2 p-4 text-[1em] leading-relaxed focus:border-brand focus:bg-surface focus:outline-none focus:ring-4 focus:ring-[var(--ring)]"
                  />
                  <p className="mt-1 text-right font-mono text-xs text-muted">{a.textAnswer.length.toLocaleString()} / 20,000</p>
                </div>
              ) : (
                <fieldset>
                  <legend className="mb-3 text-sm text-muted">{q.type === "SINGLE_CHOICE" ? "Choose one answer." : "Choose all that apply."}</legend>
                  <div className="space-y-2.5">
                    {q.options.map((o, i) => {
                      const checked = a.selectedOptionIds.includes(o.id);
                      return (
                        <label key={o.id} className={`flex cursor-pointer items-start gap-3 rounded-2xl border-2 px-4 py-3 transition has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--ring)] ${checked ? "border-brand bg-surface-2" : "border-line hover:border-line-strong"}`}>
                          <input
                            type={q.type === "SINGLE_CHOICE" ? "radio" : "checkbox"} name={`q-${q.id}`} checked={checked}
                            onChange={(e) => {
                              const sel = q.type === "SINGLE_CHOICE" ? [o.id] : e.target.checked ? [...a.selectedOptionIds, o.id] : a.selectedOptionIds.filter((x) => x !== o.id);
                              change(q.id, { selectedOptionIds: sel });
                            }}
                            className="mt-1 h-4.5 w-4.5 accent-[var(--brand)]"
                          />
                          <span aria-hidden className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-surface-2 font-mono text-xs font-bold">{LETTERS[i]}</span>
                          <span className="break-words">{o.text}</span>
                        </label>
                      );
                    })}
                  </div>
                  {/* Always rendered (hidden when empty) so the layout doesn't jump when an option is picked. */}
                  <button type="button" onClick={() => change(q.id, { selectedOptionIds: [] })} disabled={a.selectedOptionIds.length === 0}
                    aria-hidden={a.selectedOptionIds.length === 0} tabIndex={a.selectedOptionIds.length === 0 ? -1 : undefined}
                    className={`mt-3 text-sm font-semibold text-muted underline-offset-4 hover:text-ink hover:underline ${a.selectedOptionIds.length === 0 ? "invisible" : ""}`}>
                    Clear answer
                  </button>
                </fieldset>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-6 py-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <input type="checkbox" checked={a.markedForReview} onChange={(e) => change(q.id, { markedForReview: e.target.checked })} className="h-4 w-4 accent-[#e0a030]" />
                Mark for review
              </label>
              <span className="hidden text-xs text-muted lg:inline" aria-hidden><kbd className="font-mono">Alt</kbd>+<kbd className="font-mono">←/→</kbd> move · <kbd className="font-mono">Alt</kbd>+<kbd className="font-mono">R</kbd> review</span>
              <div className="flex gap-2">
                <button type="button" disabled={current === 0} onClick={() => setCurrent((c) => c - 1)} className="rounded-full border border-line-strong px-5 py-2 text-sm font-semibold hover:border-brand disabled:opacity-40">← Previous</button>
                {current < paper.questions.length - 1 ? (
                  <button type="button" onClick={() => setCurrent((c) => c + 1)} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-on-brand hover:bg-brand-hover">Next →</button>
                ) : (
                  <button type="button" onClick={() => { setSubmitError(undefined); setConfirmOpen(true); }} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-on-brand hover:bg-brand-hover">Review &amp; submit</button>
                )}
              </div>
            </div>
          </article>
          {prefs.layout === "SPLIT" ? (
            <Scratchpad attemptId={paper.id} initial={paper.scratchpad} className="xl:sticky xl:top-28 xl:h-[calc(100vh-9rem)]" />
          ) : (
            <div className="mt-4">
              <button type="button" aria-expanded={scratchOpen} onClick={() => setScratchOpen((o) => !o)} className="rounded-full border border-line-strong px-4 py-2 text-sm font-semibold hover:border-brand">
                {scratchOpen ? "Hide scratchpad" : "Open scratchpad"}
              </button>
              {scratchOpen && <Scratchpad attemptId={paper.id} initial={paper.scratchpad} className="mt-3 h-72" />}
            </div>
          )}
        </main>
      </div>

      {confirmOpen && (
        <div className="fixed inset-0 z-30 grid place-items-center bg-black/50 p-4" role="dialog" aria-modal="true" aria-labelledby="submit-title">
          <div className="w-full max-w-md space-y-4 rounded-3xl border border-line bg-surface p-6">
            <h2 id="submit-title" className="font-display text-2xl">Submit your exam?</h2>
            <dl className="grid grid-cols-3 gap-2 text-center">
              <div className="rounded-2xl bg-surface-2 p-3"><dt className="eyebrow text-muted">Answered</dt><dd className="font-mono text-2xl font-bold">{counts.answered}</dd></div>
              <div className="rounded-2xl bg-surface-2 p-3"><dt className="eyebrow text-muted">Unanswered</dt><dd className={`font-mono text-2xl font-bold ${counts.total - counts.answered ? "text-danger" : ""}`}>{counts.total - counts.answered}</dd></div>
              <div className="rounded-2xl bg-surface-2 p-3"><dt className="eyebrow text-muted">To review</dt><dd className="font-mono text-2xl font-bold">{counts.marked}</dd></div>
            </dl>
            {counts.total - counts.answered > 0 && (
              <div className="text-sm">
                <p className="mb-2 text-muted">Unanswered:</p>
                <div className="flex flex-wrap gap-1.5">
                  {paper.questions.map((x, i) => !isAnswered(answers[x.id]) && (
                    <button key={x.id} type="button" onClick={() => { setCurrent(i); setConfirmOpen(false); }} className="rounded-lg border border-line px-2.5 py-1 font-mono text-xs hover:border-brand">Q{i + 1}</button>
                  ))}
                </div>
              </div>
            )}
            {pendingCount > 0 && <p className="rounded-xl bg-notice p-3 text-sm">{pendingCount} answer(s) not yet on the server will be sent with your submission.</p>}
            <p className="text-sm text-muted">After submitting you can&apos;t change your answers.</p>
            {submitError && <p role="alert" className="rounded-xl border border-danger-line bg-danger-soft p-3 text-sm text-danger">{submitError}</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setConfirmOpen(false)} className="rounded-full border border-line-strong px-5 py-2 text-sm font-semibold">Keep working</button>
              <button type="button" onClick={() => finish(false)} className="rounded-full bg-brand px-5 py-2 text-sm font-semibold text-on-brand hover:bg-brand-hover" autoFocus>Submit exam</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
