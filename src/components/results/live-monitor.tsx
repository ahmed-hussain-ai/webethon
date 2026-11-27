"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { btn } from "@/components/staff-shell";
import { FormAlert } from "@/components/ui";

type Data = {
  serverNow: string;
  exam: { id: string; endAt: string | null };
  attempts: { id: string; candidate: { name: string; email: string }; status: string; deadlineAt: string; lastSeenAt: string | null; stale: boolean; answered: number; total: number; incidents: number }[];
  events: { id: string; type: string; label: string; incident: boolean; at: string; review: "UNREVIEWED" | "NOTED" | "DISMISSED"; note: string | null; details: Record<string, unknown>; attemptId: string; candidate: string }[];
  announcements: { id: string; message: string; createdAt: string }[];
};

const ago = (iso: string | null, now: number) => {
  if (!iso) return "never";
  const s = Math.max(0, Math.round((now - Date.parse(iso)) / 1000));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : `${Math.floor(s / 3600)}h ago`;
};
const left = (iso: string, now: number) => {
  const s = Math.max(0, Math.round((Date.parse(iso) - now) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};
const time = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" });

/** Live exam monitor (PDF 3.6): running attempts, incidents to review, announcements. Polls every 5 s. */
export function LiveMonitor({ examId, live }: { examId: string; live: boolean }) {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string>();
  const [filter, setFilter] = useState<"incidents" | "all">("incidents");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const [sendState, setSendState] = useState<{ tone: "error" | "notice"; text: string }>();
  const offset = useRef(0);
  const [now, setNow] = useState(0); // server-time "now", advanced every second

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/exams/${examId}/monitor`);
      if (!r.ok) throw new Error();
      const d: Data = await r.json();
      offset.current = Date.parse(d.serverNow) - Date.now();
      setNow(Date.parse(d.serverNow));
      setData(d);
      setError(undefined);
    } catch {
      setError("Couldn't refresh the monitor; retrying…");
    }
  }, [examId]);

  useEffect(() => {
    load(); // eslint-disable-line react-hooks/set-state-in-effect
    if (!live) return;
    const t = setInterval(load, 5000);
    const c = setInterval(() => setNow(Date.now() + offset.current), 1000);
    return () => { clearInterval(t); clearInterval(c); };
  }, [load, live]);

  async function review(id: string, status: "NOTED" | "DISMISSED" | "UNREVIEWED") {
    const note = status === "NOTED" ? prompt("Optional note for the record:") : null;
    await fetch(`/api/exams/${examId}/events/${id}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status, note }) });
    load();
  }

  async function announce(e: FormEvent) {
    e.preventDefault();
    if (!msg.trim() || sending) return;
    setSending(true);
    try {
      const r = await fetch(`/api/exams/${examId}/announcements`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: msg }) });
      const j = await r.json().catch(() => null);
      if (r.ok) { setMsg(""); setSendState({ tone: "notice", text: "Sent. Candidates see it within 20 seconds." }); load(); }
      else setSendState({ tone: "error", text: j?.error?.fields?.message ?? j?.error?.message ?? "Couldn't send" });
    } catch { setSendState({ tone: "error", text: "Can't reach the server." }); }
    setSending(false);
  }

  if (!data) return <div className="h-40 animate-pulse rounded-3xl bg-surface" aria-busy="true" />;
  const running = data.attempts.filter((a) => a.status === "IN_PROGRESS");
  const events = data.events.filter((e) => filter === "all" || e.incident);

  return (
    <div className="space-y-6">
      {error && <FormAlert>{error}</FormAlert>}
      {live && (
        <section aria-labelledby="live-title" className="overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
            <h2 id="live-title" className="font-display text-2xl">Live now <span className="font-mono text-base text-muted">({running.length} writing)</span></h2>
            <span className="flex items-center gap-2 text-xs text-muted"><span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-success" /> updates every 5 s</span>
          </div>
          {running.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Nobody is writing right now.</p> : (
            <div className="overflow-x-auto">
              <table className="mt-3 w-full text-left text-sm">
                <thead><tr className="eyebrow text-muted"><th className="px-5 py-2">Candidate</th><th className="px-3 py-2">Progress</th><th className="px-3 py-2">Time left</th><th className="px-3 py-2">Last seen</th><th className="px-5 py-2">Incidents</th></tr></thead>
                <tbody>
                  {running.map((a) => (
                    <tr key={a.id} className="border-t border-line">
                      <td className="px-5 py-3 font-semibold">{a.candidate.name}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="h-2 w-24 overflow-hidden rounded-full bg-line"><div className="h-full bg-brand" style={{ width: `${(a.answered / Math.max(1, a.total)) * 100}%` }} /></div>
                          <span className="font-mono text-xs">{a.answered}/{a.total}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono">{left(a.deadlineAt, now)}</td>
                      <td className={`px-3 py-3 ${a.stale ? "font-bold text-[#c99a3d]" : ""}`}>{ago(a.lastSeenAt, now)}{a.stale && " · possibly offline"}</td>
                      <td className="px-5 py-3">{a.incidents ? <span className="rounded-full bg-notice px-2 py-0.5 text-xs font-bold">{a.incidents}</span> : <span className="text-muted">0</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section aria-labelledby="inc-title" className="overflow-hidden rounded-3xl border border-line bg-surface">
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-5">
            <h2 id="inc-title" className="font-display text-2xl">Activity &amp; incidents</h2>
            <div role="tablist" className="flex gap-1 rounded-xl bg-surface-2 p-1 text-xs font-semibold">
              {(["incidents", "all"] as const).map((f) => (
                <button key={f} role="tab" aria-selected={filter === f} onClick={() => setFilter(f)} className={`rounded-lg px-3 py-1 ${filter === f ? "bg-brand text-on-brand" : "text-muted"}`}>{f === "incidents" ? "Incidents" : "All activity"}</button>
              ))}
            </div>
          </div>
          <p className="px-5 pt-2 text-xs text-muted">These are indicators recorded by the browser, <strong>not evidence of misconduct</strong>. A tab switch can be innocent (notification, accidental click). Review in context before drawing conclusions.</p>
          {events.length === 0 ? <p className="px-5 py-6 text-sm text-muted">Nothing recorded.</p> : (
            <ul className="mt-3 max-h-[28rem] divide-y divide-[var(--border)] overflow-y-auto">
              {events.map((e) => (
                <li key={e.id} className={`flex flex-wrap items-center gap-3 px-5 py-2.5 text-sm ${e.review === "DISMISSED" ? "opacity-50" : ""}`}>
                  <span className="w-20 shrink-0 font-mono text-xs text-muted">{time(e.at)}</span>
                  <span className="min-w-0 flex-1"><strong>{e.candidate}</strong> · {e.label}{typeof e.details?.offlineSeconds === "number" ? ` (offline ${e.details.offlineSeconds}s)` : ""}{e.note ? <span className="text-muted"> · note: {e.note}</span> : null}</span>
                  {e.incident && (
                    e.review === "UNREVIEWED" ? (
                      <span className="flex gap-1">
                        <button type="button" onClick={() => review(e.id, "NOTED")} className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold hover:border-brand">Note</button>
                        <button type="button" onClick={() => review(e.id, "DISMISSED")} className="rounded-full border border-line px-2.5 py-0.5 text-xs font-semibold hover:border-brand">Dismiss</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => review(e.id, "UNREVIEWED")} className="text-xs text-muted underline">{e.review === "NOTED" ? "Noted" : "Dismissed"} · undo</button>
                    )
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="ann-title" className="h-fit space-y-3 rounded-3xl border border-line bg-surface p-5">
          <h2 id="ann-title" className="font-display text-2xl">Announcements</h2>
          {live ? (
            <form onSubmit={announce} className="space-y-2">
              <label htmlFor="ann" className="sr-only">Message to all candidates</label>
              <textarea id="ann" rows={3} maxLength={500} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="e.g. Question 4 has a typo: read 'HAVING' as 'WHERE'."
                className="w-full rounded-xl border border-line bg-surface-2 p-3 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]" />
              <p className={`text-right text-xs ${msg.length >= 500 ? "font-semibold text-danger" : "text-muted"}`} aria-live="polite">{msg.length}/500{msg.length >= 500 ? " (limit reached)" : ""}</p>
              <button className={`${btn.primary} w-full`} disabled={!msg.trim() || sending}>{sending ? "Sending…" : "Send to all candidates"}</button>
              {sendState && <FormAlert tone={sendState.tone}>{sendState.text}</FormAlert>}
            </form>
          ) : <p className="text-sm text-muted">Announcements can be sent while the exam is open.</p>}
          <ul className="space-y-2 text-sm">
            {data.announcements.map((a) => <li key={a.id} className="rounded-xl bg-surface-2 p-3"><span className="font-mono text-xs text-muted">{time(a.createdAt)}</span><p>{a.message}</p></li>)}
          </ul>
        </section>
      </div>
    </div>
  );
}
