"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";
import { LocalTime } from "@/components/local-time";

type Enrollment = {
  id: string; status: "ACTIVE" | "REVOKED"; enrolledAt: string; revokedAt: string | null;
  candidate: { id: string; name: string; email: string; isActive: boolean; mustChangePassword: boolean };
};
type Created = { name: string; email: string; tempPassword: string };

async function call(url: string, method: string, body?: unknown) {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => null);
    return res.ok ? { ok: true as const, data: json } : { ok: false as const, message: json?.error?.fields ? Object.values(json.error.fields).join(" ") : json?.error?.message ?? "Something went wrong" };
  } catch {
    return { ok: false as const, message: "Can't reach the server. Try again." };
  }
}

function summarise(r: { added: number; reactivated: number; already: number; invalid: string[]; notFound: string[]; notCandidate: string[]; inactive: string[] }) {
  const good = [r.added && `${r.added} enrolled`, r.reactivated && `${r.reactivated} re-enrolled`, r.already && `${r.already} already enrolled`].filter(Boolean).join(", ");
  const bad = [
    r.notFound.length && `No account: ${r.notFound.join(", ")} (use the CSV import to create accounts)`,
    r.notCandidate.length && `Not candidate accounts: ${r.notCandidate.join(", ")}`,
    r.inactive.length && `Deactivated: ${r.inactive.join(", ")}`,
    r.invalid.length && `Not valid emails: ${r.invalid.join(", ")}`,
  ].filter(Boolean) as string[];
  return { good: good || "Nobody new was enrolled", bad };
}

function downloadCredentials(rows: Created[]) {
  const esc = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const csv = ["name,email,temporary_password", ...rows.map((r) => [r.name, r.email, r.tempPassword].map(esc).join(","))].join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: "candidate-credentials.csv" });
  a.click();
  URL.revokeObjectURL(url);
}

export function CandidatesPanel({ examId, enrollments, open }: { examId: string; enrollments: Enrollment[]; open: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"search" | "emails" | "csv">("search");
  const [msg, setMsg] = useState<{ tone: "error" | "notice"; text: string; extra?: string[] }>();
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ id: string; name: string; email: string }[]>([]);
  const [selected, setSelected] = useState<Map<string, string>>(new Map());
  const [emails, setEmails] = useState("");
  const [csv, setCsv] = useState<{ name: string; content: string } | null>(null);
  const [csvReport, setCsvReport] = useState<{ total: number; existing: number; toCreate: number; errors: { row: number; message: string }[] } | null>(null);
  const [created, setCreated] = useState<Created[] | null>(null);
  const active = enrollments.filter((e) => e.status === "ACTIVE");
  const enrolledIds = new Set(active.map((e) => e.candidate.id));

  useEffect(() => {
    if (mode !== "search" || !open) return;
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/candidates?q=${encodeURIComponent(query)}`, { signal: ctrl.signal })
        .then((r) => r.json()).then((d) => setResults(d.candidates ?? [])).catch(() => {});
    }, 250);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query, mode, open]);

  async function enroll(list: string[]) {
    if (!list.length || busy) return;
    setBusy(true);
    setMsg(undefined);
    const r = await call(`/api/exams/${examId}/enrollments`, "POST", { emails: list });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: r.message });
    const s = summarise(r.data);
    setMsg({ tone: s.bad.length ? "error" : "notice", text: s.good, extra: s.bad });
    setSelected(new Map());
    setEmails("");
    router.refresh();
  }

  async function revoke(e: Enrollment) {
    if (!confirm(`Remove ${e.candidate.name} from this exam? They will no longer be able to enter it. You can enroll them again later.`)) return;
    const r = await call(`/api/exams/${examId}/enrollments/${e.id}`, "DELETE");
    if (!r.ok) return setMsg({ tone: "error", text: r.message });
    router.refresh();
  }

  async function checkCsv(file: File | undefined) {
    setCsv(null); setCsvReport(null); setCreated(null); setMsg(undefined);
    if (!file) return;
    if (!file.name.toLowerCase().endsWith(".csv")) return setMsg({ tone: "error", text: "Choose a .csv file." });
    if (file.size > 1_000_000) return setMsg({ tone: "error", text: "File is larger than 1 MB." });
    const loaded = { name: file.name, content: await file.text() };
    setCsv(loaded);
    setBusy(true);
    const r = await call(`/api/exams/${examId}/enrollments/import`, "POST", { content: loaded.content, dryRun: true });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: r.message });
    setCsvReport(r.data);
  }

  async function commitCsv() {
    if (!csv || busy) return;
    setBusy(true);
    const r = await call(`/api/exams/${examId}/enrollments/import`, "POST", { content: csv.content, dryRun: false });
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: r.message });
    setCreated(r.data.created);
    setCsvReport(null);
    setCsv(null);
    setMsg({ tone: "notice", text: `Enrolled ${r.data.total} candidate(s); created ${r.data.created.length} new account(s).` });
    router.refresh();
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_420px]">
      <section aria-labelledby="enrolled-title" className="space-y-3">
        <h2 id="enrolled-title" className="font-display text-2xl">Enrolled candidates <span className="font-mono text-base text-muted">({active.length})</span></h2>
        <p className="text-sm text-muted">Only enrolled candidates can see and enter this exam, and only inside its time window.</p>
        {enrollments.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-12 text-center text-sm text-muted">Nobody is enrolled yet.</div>
        ) : (
          <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-3xl border border-line bg-surface">
            {enrollments.map((e) => (
              <li key={e.id} className={`flex flex-wrap items-center gap-3 px-5 py-3 ${e.status === "REVOKED" ? "opacity-60" : ""}`}>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{e.candidate.name}</p>
                  <p className="truncate text-xs text-muted">{e.candidate.email}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  {e.candidate.mustChangePassword && <span className="rounded-full bg-notice px-2 py-0.5">Hasn&apos;t logged in yet</span>}
                  {!e.candidate.isActive && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">Account deactivated</span>}
                  {e.status === "ACTIVE" ? (
                    <>
                      <span className="text-muted">since <LocalTime iso={e.enrolledAt} /></span>
                      {open && <button type="button" onClick={() => revoke(e)} className="rounded-full px-3 py-1 font-semibold text-danger hover:bg-danger-soft">Remove</button>}
                    </>
                  ) : (
                    <span className="rounded-full bg-surface-2 px-2 py-0.5">Removed</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside aria-label="Enroll candidates" className="h-fit space-y-4 rounded-3xl border border-line bg-surface p-4 xl:sticky xl:top-4">
        {!open ? (
          <FormAlert tone="notice">This exam has ended, so candidates can no longer be enrolled.</FormAlert>
        ) : (
          <>
            <div role="tablist" aria-label="How to enroll" className="grid grid-cols-3 gap-1 rounded-2xl bg-surface-2 p-1">
              {([["search", "Search"], ["emails", "Paste emails"], ["csv", "CSV import"]] as const).map(([m, l]) => (
                <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => { setMode(m); setMsg(undefined); }}
                  className={`rounded-xl px-2 py-2 text-sm font-semibold transition ${mode === m ? "bg-brand text-on-brand" : "text-muted hover:text-ink"}`}>{l}</button>
              ))}
            </div>

            {mode === "search" && (
              <div className="space-y-3">
                <input aria-label="Search candidates by name or email" placeholder="Search by name or email…" value={query} onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]" />
                <ul className="max-h-72 divide-y divide-[var(--border)] overflow-y-auto rounded-2xl border border-line">
                  {results.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">No candidates found</li>}
                  {results.map((c) => {
                    const already = enrolledIds.has(c.id);
                    return (
                      <li key={c.id}>
                        <label className={`flex items-center gap-3 px-3 py-2 text-sm ${already ? "opacity-60" : "cursor-pointer hover:bg-surface-2"}`}>
                          <input type="checkbox" disabled={already} checked={already || selected.has(c.id)} className="accent-[var(--brand)]"
                            onChange={(e) => setSelected((s) => { const n = new Map(s); if (e.target.checked) n.set(c.id, c.email); else n.delete(c.id); return n; })} />
                          <span className="min-w-0 flex-1"><span className="block font-medium">{c.name}</span><span className="block truncate text-xs text-muted">{c.email}</span></span>
                          {already && <span className="text-xs font-bold text-success">Enrolled</span>}
                        </label>
                      </li>
                    );
                  })}
                </ul>
                <button type="button" className={`${btn.primary} w-full`} disabled={!selected.size || busy} onClick={() => enroll([...selected.values()])}>
                  {busy ? "Enrolling…" : `Enroll ${selected.size || ""} selected`}
                </button>
              </div>
            )}

            {mode === "emails" && (
              <div className="space-y-3">
                <label htmlFor="emails" className="block text-sm font-semibold">Emails of existing candidate accounts</label>
                <textarea id="emails" rows={6} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={"one@example.com\ntwo@example.com"}
                  className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2 font-mono text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]" />
                <p className="text-xs text-muted">Separate with new lines, commas or spaces. Up to 500.</p>
                <button type="button" className={`${btn.primary} w-full`} disabled={!emails.trim() || busy}
                  onClick={() => enroll(emails.split(/[\s,;]+/).filter(Boolean))}>{busy ? "Enrolling…" : "Enroll"}</button>
              </div>
            )}

            {mode === "csv" && (
              <div className="space-y-3">
                <p className="text-sm text-muted">
                  CSV with columns <code className="font-mono">name,email</code>. Existing candidates are enrolled; new emails get an account with
                  a <strong className="text-ink">unique temporary password</strong> they must change at first login.
                </p>
                <a href="/templates/candidates-template.csv" download className="text-sm font-semibold text-brand underline">Download template</a>
                <label className="flex cursor-pointer flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 px-4 py-6 text-center text-sm hover:border-brand has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--ring)]">
                  <span className="font-semibold">{csv ? csv.name : "Choose a .csv file"}</span>
                  <input type="file" accept=".csv,text/csv" className="sr-only" onChange={(e) => { checkCsv(e.target.files?.[0]); e.target.value = ""; }} />
                </label>
                {csvReport && (
                  <div className="space-y-2 text-sm">
                    <p>{csvReport.total} rows · {csvReport.existing} existing · <strong>{csvReport.toCreate} new accounts</strong></p>
                    {csvReport.errors.length > 0 ? (
                      <ul className="max-h-48 space-y-1 overflow-y-auto rounded-xl border border-danger-line bg-danger-soft p-3 text-danger">
                        {csvReport.errors.map((e, i) => <li key={i}><span className="font-mono">Row {e.row}</span>: {e.message}</li>)}
                      </ul>
                    ) : (
                      <button type="button" className={`${btn.primary} w-full`} disabled={busy} onClick={commitCsv}>{busy ? "Importing…" : `Enroll ${csvReport.total} candidate(s)`}</button>
                    )}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {msg && (
          <FormAlert tone={msg.tone}>
            {msg.text}
            {msg.extra?.map((x) => <span key={x} className="mt-1 block text-xs">{x}</span>)}
          </FormAlert>
        )}

        {created && created.length > 0 && (
          <div className="space-y-2 rounded-2xl border border-notice-line bg-notice p-3 text-sm">
            <p className="font-semibold">New accounts: temporary passwords (shown only once)</p>
            <p className="text-xs text-muted">Share each password privately. Candidates must change it when they first log in.</p>
            <ul className="max-h-48 space-y-1 overflow-y-auto font-mono text-xs">
              {created.map((c) => <li key={c.email}>{c.email} · <strong>{c.tempPassword}</strong></li>)}
            </ul>
            <button type="button" className={`${btn.secondary} w-full`} onClick={() => downloadCredentials(created)}>Download as CSV</button>
          </div>
        )}
      </aside>
    </div>
  );
}
