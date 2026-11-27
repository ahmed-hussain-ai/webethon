"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { categoryInputSchema } from "@/lib/validation/questions";
import { Field, FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";

type Cat = { id: string; name: string; description: string | null; createdByName: string; questionCount: number; canManage: boolean };

async function send(url: string, method: string, body?: unknown) {
  try {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const json = await res.json().catch(() => null);
    return res.ok ? { ok: true as const } : { ok: false as const, error: json?.error ?? { message: "Something went wrong" } };
  } catch {
    return { ok: false as const, error: { message: "Can't reach the server. Try again." } };
  }
}

function CategoryRow({ cat }: { cat: Cat }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(cat.name);
  const [description, setDescription] = useState(cat.description ?? "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    const parsed = categoryInputSchema.safeParse({ name, description });
    if (!parsed.success) return setError(parsed.error.issues[0].message);
    setBusy(true);
    const r = await send(`/api/categories/${cat.id}`, "PATCH", parsed.data);
    setBusy(false);
    if (!r.ok) return setError(r.error.fields?.name ?? r.error.message);
    setEditing(false);
    setError(null);
    router.refresh();
  }

  async function remove() {
    if (!confirm(`Delete the category "${cat.name}"?`)) return;
    setBusy(true);
    const r = await send(`/api/categories/${cat.id}`, "DELETE");
    setBusy(false);
    if (!r.ok) return setError(r.error.message);
    router.refresh();
  }

  return (
    <li className="px-5 py-4">
      {editing ? (
        <form onSubmit={save} noValidate className="grid gap-3 sm:grid-cols-[1fr_1.5fr_auto] sm:items-end">
          <Field label="Name" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus />
          <Field label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} />
          <div className="flex gap-2">
            <button className={btn.primary} disabled={busy}>{busy ? "Saving…" : "Save"}</button>
            <button type="button" className={btn.secondary} onClick={() => { setEditing(false); setName(cat.name); setDescription(cat.description ?? ""); setError(null); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-semibold">{cat.name}</p>
            <p className="text-xs text-muted">
              {cat.description ? `${cat.description} · ` : ""}by {cat.createdByName}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link href={`/questions?category=${cat.id}&status=all`} className="rounded-full border border-line px-3 py-1 font-mono text-xs hover:border-brand hover:text-brand">
              {cat.questionCount} question{cat.questionCount === 1 ? "" : "s"}
            </Link>
            {cat.canManage && (
              <>
                <button type="button" className="rounded-full px-3 py-1 text-sm font-semibold text-brand hover:bg-surface-2" onClick={() => setEditing(true)}>Rename</button>
                <button
                  type="button" onClick={remove} disabled={busy || cat.questionCount > 0}
                  title={cat.questionCount > 0 ? "Only empty categories can be deleted" : undefined}
                  className="rounded-full px-3 py-1 text-sm font-semibold text-danger hover:bg-danger-soft disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Delete
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {error && <div className="mt-3"><FormAlert>{error}</FormAlert></div>}
    </li>
  );
}

export function CategoryManager({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const parsed = categoryInputSchema.safeParse({ name: f.get("name"), description: f.get("description") });
    setAlert(null);
    if (!parsed.success) return setFields(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setFields({});
    setBusy(true);
    const r = await send("/api/categories", "POST", parsed.data);
    setBusy(false);
    if (!r.ok) return r.error.fields ? setFields(r.error.fields) : setAlert(r.error.message);
    formEl.reset();
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <section aria-label="Categories" className="h-fit overflow-hidden rounded-3xl border border-line bg-surface">
        {categories.length ? (
          <ul className="divide-y divide-[var(--border)]">{categories.map((c) => <CategoryRow key={c.id} cat={c} />)}</ul>
        ) : (
          <p className="px-6 py-12 text-center text-muted">No categories yet. Create the first one.</p>
        )}
      </section>
      <form onSubmit={create} noValidate className="h-fit space-y-4 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-display text-xl">New category</h2>
        {alert && <FormAlert>{alert}</FormAlert>}
        <Field label="Name" name="name" maxLength={80} error={fields.name} />
        <Field label="Description (optional)" name="description" maxLength={500} error={fields.description} />
        <button className={`${btn.primary} w-full`} disabled={busy}>{busy ? "Creating…" : "Create category"}</button>
      </form>
    </div>
  );
}
