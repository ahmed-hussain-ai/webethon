"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { examCreateSchema } from "@/lib/validation/exams";
import { postJson } from "@/lib/client/api";
import { Field } from "@/components/ui";
import { btn } from "@/components/staff-shell";

export function NewExamForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const parsed = examCreateSchema.safeParse({ title: new FormData(e.currentTarget).get("title") });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    const r = await postJson<{ id: string }>("/api/exams", parsed.data);
    if (!r.ok) {
      setBusy(false);
      return setError(r.error.fields?.title ?? r.error.message);
    }
    router.push(`/exams/${r.data.id}`);
  }

  if (!open) return <button type="button" className={btn.primary} onClick={() => setOpen(true)}>+ New exam</button>;
  return (
    <form onSubmit={submit} noValidate className="flex w-full flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-4 sm:w-auto">
      <div className="min-w-64 flex-1">
        <Field label="Exam title" name="title" maxLength={200} error={error} autoFocus placeholder="e.g. Database Systems Final" />
      </div>
      <button className={btn.primary} disabled={busy}>{busy ? "Creating…" : "Create draft"}</button>
      <button type="button" className={btn.secondary} onClick={() => { setOpen(false); setError(undefined); }}>Cancel</button>
    </form>
  );
}
