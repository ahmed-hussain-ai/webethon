"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ───────────── Integrity events + heartbeat (PDF 3.6) ─────────────
type Ev = { type: string; at: string; details?: Record<string, string | number | boolean> };

/**
 * Records tab switches, window switches, copy/paste, fullscreen exits and connection drops,
 * and sends them (with a heartbeat) every 10 s. Nothing is blocked; these are indicators only.
 * Returns whether the exam currently needs the candidate to (re-)enter fullscreen.
 */
export function useIntegrity(attemptId: string, requireFullscreen: boolean, resumed: boolean) {
  const queue = useRef<Ev[]>([]);
  const offlineSince = useRef<number | null>(null);
  const supported = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const [needFullscreen, setNeedFullscreen] = useState(false);

  const push = useCallback((type: string, details?: Ev["details"]) => {
    queue.current.push({ type, at: new Date().toISOString(), details });
  }, []);

  useEffect(() => {
    if (resumed) push("RESUMED");
    const onVis = () => { if (document.visibilityState === "hidden") push("TAB_HIDDEN"); };
    const onBlur = () => { if (document.visibilityState === "visible") push("WINDOW_BLUR"); };
    const onCopy = () => push("COPY", { length: String(document.getSelection()?.toString().length ?? 0) });
    const onPaste = (e: ClipboardEvent) => push("PASTE", { length: e.clipboardData?.getData("text").length ?? 0 });
    const onOffline = () => { offlineSince.current = Date.now(); push("CONNECTION_LOST"); };
    const onOnline = () => {
      const secs = offlineSince.current ? Math.round((Date.now() - offlineSince.current) / 1000) : 0;
      offlineSince.current = null;
      push("CONNECTION_RESTORED", { offlineSeconds: secs });
    };
    const onFs = () => {
      if (!document.fullscreenElement && requireFullscreen) { push("FULLSCREEN_EXIT"); setNeedFullscreen(true); }
      if (document.fullscreenElement) setNeedFullscreen(false);
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("blur", onBlur);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    document.addEventListener("fullscreenchange", onFs);
    if (requireFullscreen && supported && !document.fullscreenElement) setNeedFullscreen(true); // eslint-disable-line react-hooks/set-state-in-effect

    const send = async () => {
      if (!navigator.onLine) return;
      const batch = queue.current.splice(0, 50);
      try {
        const res = await fetch(`/api/my/attempts/${attemptId}/events`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ events: batch }),
        });
        if (!res.ok && res.status !== 409) queue.current.unshift(...batch);
      } catch {
        queue.current.unshift(...batch); // retry next tick
      }
    };
    send();
    const t = setInterval(send, 10_000);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      document.removeEventListener("fullscreenchange", onFs);
    };
  }, [attemptId, requireFullscreen, supported, resumed, push]);

  const enterFullscreen = useCallback(() => {
    document.documentElement.requestFullscreen?.().catch(() => setNeedFullscreen(false));
  }, []);
  return { needFullscreen: needFullscreen && supported, enterFullscreen };
}

export function FullscreenGate({ onEnter }: { onEnter: () => void }) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 p-4" role="dialog" aria-modal="true" aria-labelledby="fs-title">
      <div className="w-full max-w-md space-y-4 rounded-3xl border border-line bg-surface p-6 text-center">
        <h2 id="fs-title" className="font-display text-2xl">Fullscreen required</h2>
        <p className="text-sm text-muted">This exam must be taken in fullscreen. Leaving fullscreen is recorded for your examiner. Your timer keeps running.</p>
        <button type="button" autoFocus onClick={onEnter} className="rounded-full bg-brand px-6 py-2.5 font-semibold text-on-brand hover:bg-brand-hover">Enter fullscreen</button>
      </div>
    </div>
  );
}

// ───────────── Announcements from the examiner ─────────────
type Ann = { id: string; message: string; createdAt: string };

export function Announcements({ attemptId }: { attemptId: string }) {
  const [list, setList] = useState<Ann[]>([]);
  const [seen, setSeen] = useState<string[]>([]);
  const key = `ann-seen:${attemptId}`;

  useEffect(() => {
    try { setSeen(JSON.parse(localStorage.getItem(key) ?? "[]")); } catch { /* ignore */ } // eslint-disable-line react-hooks/set-state-in-effect
    const load = () =>
      fetch(`/api/my/attempts/${attemptId}/announcements`).then((r) => (r.ok ? r.json() : null)).then((d) => d && setList(d.announcements)).catch(() => {});
    load();
    const t = setInterval(load, 20_000);
    return () => clearInterval(t);
  }, [attemptId, key]);

  const unseen = list.filter((a) => !seen.includes(a.id));
  if (!unseen.length) return null;
  const dismiss = () => {
    const next = [...seen, ...unseen.map((a) => a.id)];
    setSeen(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* ignore */ }
  };
  return (
    <div role="alert" className="border-b border-notice-line bg-notice">
      <div className="mx-auto flex max-w-7xl items-start gap-3 px-4 py-3">
        <span aria-hidden className="mt-0.5 text-lg">📣</span>
        <div className="flex-1 space-y-1 text-sm">
          <p className="font-bold">Announcement from your examiner</p>
          {unseen.map((a) => <p key={a.id}>{a.message}</p>)}
        </div>
        <button type="button" onClick={dismiss} className="rounded-full border border-notice-line px-3 py-1 text-xs font-semibold hover:bg-surface">Got it</button>
      </div>
    </div>
  );
}

// ───────────── Scratchpad (PDF 4.8) ─────────────
export function Scratchpad({ attemptId, initial, className = "" }: { attemptId: string; initial: string; className?: string }) {
  const key = `scratch:${attemptId}`;
  const [text, setText] = useState(initial);
  const [state, setState] = useState<"saved" | "saving" | "local">("saved");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // A newer local copy (e.g. typed while offline) wins over the server copy.
    try { const l = localStorage.getItem(key); if (l !== null && l !== initial) { setText(l); setState("local"); } } catch { /* ignore */ } // eslint-disable-line react-hooks/set-state-in-effect
  }, [key, initial]);

  function change(v: string) {
    setText(v);
    try { localStorage.setItem(key, v); } catch { /* ignore */ }
    setState("local");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setState("saving");
      try {
        const r = await fetch(`/api/my/attempts/${attemptId}/scratchpad`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content: v }) });
        setState(r.ok ? "saved" : "local");
      } catch { setState("local"); }
    }, 1500);
  }

  return (
    <section aria-label="Scratchpad" className={`flex flex-col rounded-3xl border border-line bg-surface ${className}`}>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="eyebrow text-muted">Scratchpad</h2>
        <span className="text-xs text-muted">{state === "saved" ? "Saved" : state === "saving" ? "Saving…" : "On this device"} · not marked</span>
      </div>
      <label htmlFor="scratch" className="sr-only">Rough work (not marked)</label>
      <textarea id="scratch" value={text} onChange={(e) => change(e.target.value)} maxLength={20000} placeholder="Rough work, calculations, notes… Only you can see this."
        className="min-h-48 flex-1 resize-none rounded-b-3xl bg-surface p-4 font-mono text-sm leading-relaxed focus:outline-none" />
    </section>
  );
}

// ───────────── Workspace preferences (PDF 4.7) ─────────────
export type Prefs = { theme: "LIGHT" | "DARK"; fontSize: "SMALL" | "MEDIUM" | "LARGE" | "XLARGE"; layout: "SINGLE" | "SPLIT"; navPosition: "LEFT" | "RIGHT" | "BOTTOM"; highContrast: boolean };

function Opt<K extends keyof Prefs>({ label, options, value, onPick }: { label: string; options: [Prefs[K], string][]; value: Prefs[K]; onPick: (v: Prefs[K]) => void }) {
  return (
    <fieldset>
      <legend className="mb-1 text-xs font-semibold text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map(([v, l]) => (
          <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => onPick(v)}
            className={`rounded-lg border px-2.5 py-1 text-xs font-semibold ${value === v ? "border-brand bg-brand text-on-brand" : "border-line hover:border-brand"}`}>{l}</button>
        ))}
      </div>
    </fieldset>
  );
}

export function PrefsMenu({ prefs, onChange }: { prefs: Prefs; onChange: (p: Prefs) => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState(false);
  async function set<K extends keyof Prefs>(k: K, v: Prefs[K]) {
    const next = { ...prefs, [k]: v };
    onChange(next);
    if (k === "theme") {
      document.documentElement.setAttribute("data-theme", v === "DARK" ? "dark" : "light");
      try { localStorage.setItem("theme", v === "DARK" ? "dark" : "light"); } catch { /* ignore */ }
    }
    try {
      const r = await fetch("/api/me/preferences", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
      setError(!r.ok);
    } catch { setError(true); }
  }
  return (
    <div className="relative">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="chip rounded-full px-3 py-1.5 text-sm font-semibold hover:bg-white/15">Display</button>
      {open && (
        <div className="absolute right-0 z-30 mt-2 w-72 space-y-3 rounded-2xl border border-line bg-surface p-4 text-ink shadow-xl">
          <Opt<"fontSize"> value={prefs.fontSize} onPick={(v) => set("fontSize", v)} label="Text size" options={[["SMALL", "A−"], ["MEDIUM", "A"], ["LARGE", "A+"], ["XLARGE", "A++"]]} />
          <Opt<"layout"> value={prefs.layout} onPick={(v) => set("layout", v)} label="Layout" options={[["SINGLE", "Question only"], ["SPLIT", "Question + scratchpad"]]} />
          <Opt<"navPosition"> value={prefs.navPosition} onPick={(v) => set("navPosition", v)} label="Question list" options={[["LEFT", "Left"], ["RIGHT", "Right"], ["BOTTOM", "Bottom"]]} />
          <Opt<"theme"> value={prefs.theme} onPick={(v) => set("theme", v)} label="Theme" options={[["LIGHT", "Light"], ["DARK", "Dark"]]} />
          <Opt<"highContrast"> value={prefs.highContrast} onPick={(v) => set("highContrast", v)} label="High contrast" options={[[false, "Off"], [true, "On"]]} />
          <p className="text-xs text-muted">{error ? "Couldn't save; applied for now." : "Saved to your account for next time."}</p>
          <button type="button" onClick={() => setOpen(false)} className="w-full rounded-full border border-line py-1.5 text-sm font-semibold">Close</button>
        </div>
      )}
    </div>
  );
}
