"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";
import { TYPE_LABEL } from "@/lib/validation/questions";

type Issue = { row: number; message: string };
type Report = {
  total: number; validCount: number; errors: Issue[]; warnings: Issue[]; newCategories: string[];
  preview: { row: number; type: keyof typeof TYPE_LABEL; category: string; difficulty: string; marks: number; text: string; options: number }[];
};
const MAX_BYTES = 1_000_000;

export function ImportWizard() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<{ name: string; format: "csv" | "json"; content: string } | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"check" | "import" | null>(null);
  const [done, setDone] = useState<{ imported: number; newCategories: string[] } | null>(null);

  async function call(f: NonNullable<typeof file>, dryRun: boolean) {
    try {
      const res = await fetch("/api/questions/import", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: f.format, content: f.content, dryRun }),
      });
      const json = await res.json().catch(() => null);
      return res.ok ? { ok: true as const, data: json } : { ok: false as const, message: json?.error?.message ?? "Something went wrong" };
    } catch {
      return { ok: false as const, message: "Can't reach the server. Check your connection and try again." };
    }
  }

  async function pick(f: File | undefined) {
    setReport(null); setError(null); setDone(null); setFile(null);
    if (!f) return;
    const ext = f.name.toLowerCase().split(".").pop();
    if (ext !== "csv" && ext !== "json") return setError("Choose a .csv or .json file.");
    if (f.size > MAX_BYTES) return setError("File is larger than 1 MB. Split it into smaller files.");
    const loaded = { name: f.name, format: ext, content: await f.text() } as const;
    setFile(loaded);
    setBusy("check");
    const r = await call(loaded, true);
    setBusy(null);
    if (!r.ok) return setError(r.message);
    setReport(r.data);
  }

  async function doImport() {
    if (!file || !report || report.errors.length || busy) return;
    setBusy("import");
    const r = await call(file, false);
    setBusy(null);
    if (!r.ok) return setError(r.message);
    setDone(r.data);
    setReport(null);
    setFile(null);
    if (input.current) input.current.value = "";
    router.refresh();
  }

  const errorRows = report ? new Set(report.errors.map((e) => e.row)).size : 0;

  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-line bg-surface p-5 sm:p-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-xl space-y-1 text-sm text-muted">
            <p><strong className="text-ink">Step 1.</strong> Download a template and fill it in (up to 500 questions, 1 MB).</p>
            <p><strong className="text-ink">Step 2.</strong> Upload it. Every row is checked; nothing is saved yet.</p>
            <p><strong className="text-ink">Step 3.</strong> If there are no errors, import. It&apos;s all-or-nothing, so a file never half-imports.</p>
          </div>
          <div className="flex gap-2">
            <a href="/templates/questions-template.csv" download className={btn.secondary}>CSV template</a>
            <a href="/templates/questions-template.json" download className={btn.secondary}>JSON template</a>
          </div>
        </div>
        <label className="mt-6 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line-strong bg-surface-2 px-6 py-10 text-center transition hover:border-brand has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--ring)]">
          <span className="font-semibold">{file ? file.name : "Choose a .csv or .json file"}</span>
          <span className="text-xs text-muted">
            CSV columns: type, category, difficulty, marks, text, option_a…option_j, correct (e.g. B or A;C), model_answer, explanation
          </span>
          <input ref={input} type="file" accept=".csv,.json,text/csv,application/json" className="sr-only" onChange={(e) => pick(e.target.files?.[0])} />
        </label>
        {busy === "check" && <p className="mt-4 text-sm text-muted" aria-live="polite">Checking every row…</p>}
        {error && <div className="mt-4"><FormAlert>{error}</FormAlert></div>}
        {done && (
          <div className="mt-4">
            <FormAlert tone="notice">
              Imported {done.imported} question{done.imported === 1 ? "" : "s"}
              {done.newCategories.length ? ` and created ${done.newCategories.length} categor${done.newCategories.length === 1 ? "y" : "ies"} (${done.newCategories.join(", ")})` : ""}.{" "}
              <Link href="/questions?mine=1" className="font-semibold underline">View them</Link>
            </FormAlert>
          </div>
        )}
      </section>

      {report && (
        <section aria-label="Import check" className="space-y-5">
          <dl className="grid gap-3 sm:grid-cols-4">
            {[
              ["Rows", report.total, ""],
              ["Ready", report.validCount, "text-success"],
              ["Rows with errors", errorRows, errorRows ? "text-danger" : ""],
              ["New categories", report.newCategories.length, ""],
            ].map(([label, n, cls]) => (
              <div key={label as string} className="rounded-2xl border border-line bg-surface px-5 py-4">
                <dt className="eyebrow text-muted">{label}</dt>
                <dd className={`mt-1 font-mono text-3xl font-semibold ${cls}`}>{n}</dd>
              </div>
            ))}
          </dl>

          {report.errors.length > 0 && (
            <div className="overflow-hidden rounded-3xl border border-danger-line bg-surface">
              <p className="border-b border-danger-line bg-danger-soft px-5 py-3 font-semibold text-danger">
                Fix these and upload again. Nothing will be imported until every row is valid.
              </p>
              <ul className="max-h-80 divide-y divide-[var(--border)] overflow-y-auto text-sm">
                {report.errors.map((e, i) => (
                  <li key={i} className="flex gap-4 px-5 py-2.5">
                    <span className="w-16 shrink-0 font-mono text-muted">Row {e.row}</span>
                    <span>{e.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.warnings.length > 0 && (
            <FormAlert tone="notice">
              {report.warnings.length} row(s) look like questions already in the bank (rows {report.warnings.map((w) => w.row).join(", ")}).
              They will still be imported.
            </FormAlert>
          )}
          {report.newCategories.length > 0 && (
            <FormAlert tone="notice">These categories will be created: {report.newCategories.join(", ")}.</FormAlert>
          )}

          {report.preview.length > 0 && (
            <div className="overflow-x-auto rounded-3xl border border-line bg-surface">
              <table className="w-full text-left text-sm">
                <caption className="px-5 pt-4 text-left eyebrow text-muted">Valid rows {report.validCount > 50 ? "(first 50)" : ""}</caption>
                <thead>
                  <tr className="eyebrow text-muted">
                    <th className="px-5 py-3">Row</th><th className="px-3 py-3">Question</th><th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Category</th><th className="px-3 py-3">Marks</th>
                  </tr>
                </thead>
                <tbody>
                  {report.preview.map((p) => (
                    <tr key={p.row} className="border-t border-line">
                      <td className="px-5 py-2.5 font-mono text-muted">{p.row}</td>
                      <td className="max-w-md truncate px-3 py-2.5">{p.text}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap">{TYPE_LABEL[p.type]}{p.options ? ` · ${p.options} opts` : ""}</td>
                      <td className="px-3 py-2.5">{p.category}</td>
                      <td className="px-3 py-2.5 font-mono">{p.marks}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={doImport} disabled={report.errors.length > 0 || !!busy} className={btn.primary}>
              {busy === "import" ? "Importing…" : `Import ${report.validCount} question${report.validCount === 1 ? "" : "s"}`}
            </button>
            {report.errors.length > 0 && <span className="text-sm text-muted">Import is disabled until all errors are fixed.</span>}
          </div>
        </section>
      )}
    </div>
  );
}
