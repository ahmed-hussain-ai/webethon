"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import type { UserRow } from "@/lib/users/service";
import { createUserSchema } from "@/lib/validation/auth";
import { Field, FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";
import { LocalTime } from "@/components/local-time";

type Msg = { tone: "error" | "notice"; text: string; secret?: string };
const ROLES = ["ADMIN", "EXAMINER", "CANDIDATE"] as const;

async function call(url: string, method: string, body?: unknown) {
  try {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => null);
    return r.ok ? { ok: true as const, data: j } : { ok: false as const, message: j?.error?.fields ? Object.values(j.error.fields).join(" ") : j?.error?.message ?? "Something went wrong" };
  } catch {
    return { ok: false as const, message: "Can't reach the server." };
  }
}

function Row({ u, me }: { u: UserRow; me: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState<Msg>();
  const [busy, setBusy] = useState(false);
  const self = u.id === me;

  async function patch(body: object, confirmText?: string) {
    if (confirmText && !confirm(confirmText)) return;
    setBusy(true);
    const r = await call(`/api/users/${u.id}`, "PATCH", body);
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: r.message });
    setMsg(undefined);
    router.refresh();
  }
  async function reset() {
    if (!confirm(`Reset ${u.name}'s password? They'll be signed out everywhere and must use the new temporary password.`)) return;
    setBusy(true);
    const r = await call(`/api/users/${u.id}/reset-password`, "POST");
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: r.message });
    setMsg({ tone: "notice", text: "New temporary password (shown once, share it privately):", secret: r.data.tempPassword });
  }

  return (
    <li className={`px-5 py-3 ${u.isActive ? "" : "opacity-60"}`}>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-semibold">{u.name}{self && <span className="ml-2 rounded-full bg-surface-2 px-2 text-xs">you</span>}</p>
          <p className="truncate text-xs text-muted">{u.email} · last login {u.lastLoginAt ? <LocalTime iso={u.lastLoginAt} /> : "never"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {u.mustChangePassword && <span className="rounded-full bg-notice px-2 py-0.5">Temporary password</span>}
          {u.locked && <span className="rounded-full bg-danger-soft px-2 py-0.5 text-danger">Locked (too many attempts)</span>}
          <label className="sr-only" htmlFor={`role-${u.id}`}>Role of {u.name}</label>
          <select id={`role-${u.id}`} value={u.role} disabled={self || busy}
            onChange={(e) => patch({ role: e.target.value }, `Change ${u.name}'s role to ${e.target.value.toLowerCase()}? They'll be signed out.`)}
            className="rounded-lg border border-line bg-surface-2 px-2 py-1 font-semibold disabled:opacity-60">
            {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
          </select>
          <button type="button" disabled={self || busy} onClick={() => patch({ isActive: !u.isActive }, u.isActive ? `Deactivate ${u.name}? They'll be signed out and can't log in.` : undefined)}
            className="rounded-full border border-line px-3 py-1 font-semibold hover:border-brand disabled:opacity-40">{u.isActive ? "Deactivate" : "Activate"}</button>
          <button type="button" disabled={self || busy} onClick={reset} className="rounded-full border border-line px-3 py-1 font-semibold hover:border-brand disabled:opacity-40">Reset password</button>
        </div>
      </div>
      {msg && <div className="mt-2"><FormAlert tone={msg.tone}>{msg.text} {msg.secret && <strong className="font-mono">{msg.secret}</strong>}</FormAlert></div>}
    </li>
  );
}

export function UserManager({ users, me }: { users: UserRow[]; me: string }) {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<Msg>();
  const [busy, setBusy] = useState(false);

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const f = new FormData(formEl);
    const parsed = createUserSchema.safeParse({ name: f.get("name"), email: f.get("email"), role: f.get("role") });
    if (!parsed.success) return setFields(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setFields({});
    setBusy(true);
    const r = await call("/api/users", "POST", parsed.data);
    setBusy(false);
    if (!r.ok) return setMsg({ tone: "error", text: r.message });
    formEl.reset();
    setMsg({ tone: "notice", text: `Created ${r.data.user.email}. Temporary password (shown once):`, secret: r.data.tempPassword });
    router.refresh();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
      <ul className="h-fit divide-y divide-[var(--border)] overflow-hidden rounded-3xl border border-line bg-surface">
        {users.length ? users.map((u) => <Row key={u.id} u={u} me={me} />) : <li className="px-5 py-10 text-center text-sm text-muted">No users match.</li>}
      </ul>
      <form onSubmit={create} noValidate className="h-fit space-y-4 rounded-3xl border border-line bg-surface p-5">
        <h2 className="font-display text-xl">New user</h2>
        <Field label="Full name" name="name" error={fields.name} />
        <Field label="Email" name="email" type="email" error={fields.email} />
        <label className="block text-sm"><span className="mb-1.5 block font-semibold">Role</span>
          <select name="role" defaultValue="EXAMINER" className="w-full rounded-xl border border-line bg-surface-2 px-3 py-2.5">
            {ROLES.map((r) => <option key={r} value={r}>{r.charAt(0) + r.slice(1).toLowerCase()}</option>)}
          </select>
        </label>
        <p className="text-xs text-muted">A unique temporary password is generated; the user must change it at first login.</p>
        <button className={`${btn.primary} w-full`} disabled={busy}>{busy ? "Creating…" : "Create user"}</button>
        {msg && <FormAlert tone={msg.tone}>{msg.text} {msg.secret && <strong className="font-mono">{msg.secret}</strong>}</FormAlert>}
      </form>
    </div>
  );
}
