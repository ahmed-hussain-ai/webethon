"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import type { UserRow } from "@/lib/users/service";
import { createUserSchema } from "@/lib/validation/auth";
import { CredentialCard, Field, FormAlert, Modal } from "@/components/ui";
import { btn } from "@/components/staff-shell";
import { LocalTime } from "@/components/local-time";

const ROLES = ["ADMIN", "EXAMINER", "CANDIDATE"] as const;
type Role = (typeof ROLES)[number];
const ROLE_LABEL: Record<Role, string> = { ADMIN: "Administrator", EXAMINER: "Examiner", CANDIDATE: "Candidate" };
const ROLE_STYLE: Record<Role, string> = {
  ADMIN: "bg-[#efe7fb] text-[#5b3aa0] border-[#d9c8f2]",
  EXAMINER: "bg-[#e3f1ef] text-[#0f5e5a] border-[#bcdcd8]",
  CANDIDATE: "bg-surface-2 text-ink border-line",
};

async function call(url: string, method: string, body?: unknown) {
  try {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const j = await r.json().catch(() => null);
    return r.ok ? { ok: true as const, data: j } : { ok: false as const, message: j?.error?.fields ? Object.values(j.error.fields).join(" ") : j?.error?.message ?? "Something went wrong" };
  } catch {
    return { ok: false as const, message: "Can't reach the server. Check your connection." };
  }
}

const initials = (n: string) => n.split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");

type Dialog =
  | { kind: "create" }
  | { kind: "credentials"; title: string; name: string; email: string; password: string; note: string }
  | { kind: "confirm"; title: string; body: string; action: string; danger?: boolean; run: () => Promise<string | null> };

export function UserManager({ users, me, filters }: { users: UserRow[]; me: string; filters?: ReactNode }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [rowError, setRowError] = useState<{ id: string; text: string }>();

  const close = () => { if (!busy) { setDialog(null); setError(undefined); setFields({}); } };

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const parsed = createUserSchema.safeParse({ name: f.get("name"), email: f.get("email"), role: f.get("role") });
    if (!parsed.success) return setFields(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
    setFields({});
    setBusy(true);
    const r = await call("/api/users", "POST", parsed.data);
    setBusy(false);
    if (!r.ok) return setError(r.message);
    setError(undefined);
    setDialog({ kind: "credentials", title: "User created", name: r.data.user.name, email: r.data.user.email, password: r.data.tempPassword, note: `${ROLE_LABEL[r.data.user.role as Role]} account is ready.` });
    router.refresh();
  }

  function confirmRole(u: UserRow, role: Role) {
    setDialog({
      kind: "confirm", title: "Change role?", action: `Make ${ROLE_LABEL[role].toLowerCase()}`,
      body: `${u.name} will become ${ROLE_LABEL[role].toLowerCase() === "administrator" ? "an administrator" : `a ${ROLE_LABEL[role].toLowerCase()}`} and will be signed out of every device.`,
      run: async () => { const r = await call(`/api/users/${u.id}`, "PATCH", { role }); return r.ok ? null : r.message; },
    });
  }
  function confirmActive(u: UserRow) {
    setDialog({
      kind: "confirm", title: u.isActive ? "Deactivate account?" : "Activate account?", danger: u.isActive,
      action: u.isActive ? "Deactivate" : "Activate",
      body: u.isActive ? `${u.name} will be signed out immediately and won't be able to log in. Their exams and results are kept.` : `${u.name} will be able to log in again.`,
      run: async () => { const r = await call(`/api/users/${u.id}`, "PATCH", { isActive: !u.isActive }); return r.ok ? null : r.message; },
    });
  }
  function confirmReset(u: UserRow) {
    setDialog({
      kind: "confirm", title: "Reset password?", action: "Reset password", danger: true,
      body: `A new temporary password will be created for ${u.name}. They'll be signed out everywhere and must choose a new password at their next login.`,
      run: async () => {
        const r = await call(`/api/users/${u.id}/reset-password`, "POST");
        if (!r.ok) return r.message;
        setDialog({ kind: "credentials", title: "Password reset", name: u.name, email: u.email, password: r.data.tempPassword, note: "Their old password no longer works." });
        return "__keep";
      },
    });
  }

  async function runConfirm(d: Extract<Dialog, { kind: "confirm" }>) {
    setBusy(true);
    const err = await d.run();
    setBusy(false);
    if (err === "__keep") { router.refresh(); return; }
    if (err) return setError(err);
    setDialog(null);
    router.refresh();
  }

  return (
    <>
      <div className="mb-5 flex flex-wrap items-stretch gap-3">
        <div className="min-w-0 flex-1">{filters}</div>
        <button type="button" className={`${btn.primary} self-center`} onClick={() => setDialog({ kind: "create" })}>+ New user</button>
      </div>
      <div className="overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-surface-2">
              <tr className="eyebrow text-muted">
                <th className="px-5 py-3">User</th><th className="px-3 py-3">Role</th><th className="px-3 py-3">Status</th><th className="px-3 py-3">Last login</th><th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 && <tr><td colSpan={5} className="px-5 py-12 text-center text-muted">No users match these filters.</td></tr>}
              {users.map((u) => {
                const self = u.id === me;
                return (
                  <tr key={u.id} className={`border-t border-line align-middle ${u.isActive ? "" : "bg-surface-2/60"}`}>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <span aria-hidden className={`grid h-10 w-10 shrink-0 place-items-center rounded-full border font-semibold ${ROLE_STYLE[u.role]}`}>{initials(u.name)}</span>
                        <div className="min-w-0">
                          <p className="font-semibold">{u.name}{self && <span className="ml-2 rounded-full bg-brand px-2 py-0.5 text-[0.65rem] font-bold text-on-brand">YOU</span>}</p>
                          <p className="truncate text-xs text-muted">{u.email}</p>
                        </div>
                      </div>
                      {rowError?.id === u.id && <p className="mt-1 text-xs text-danger">{rowError.text}</p>}
                    </td>
                    <td className="px-3 py-3">
                      <label className="sr-only" htmlFor={`role-${u.id}`}>Role of {u.name}</label>
                      <select id={`role-${u.id}`} value={u.role} disabled={self}
                        onChange={(e) => { setRowError(undefined); confirmRole(u, e.target.value as Role); }}
                        className={`rounded-full border px-3 py-1 text-xs font-bold disabled:cursor-not-allowed ${ROLE_STYLE[u.role]}`}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-wrap gap-1">
                        <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${u.isActive ? "bg-success-soft text-success" : "bg-danger-soft text-danger"}`}>{u.isActive ? "Active" : "Deactivated"}</span>
                        {u.mustChangePassword && <span className="rounded-full bg-notice px-2.5 py-0.5 text-xs font-semibold">Temp password</span>}
                        {u.locked && <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-xs font-semibold text-danger">Locked</span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs text-muted">{u.lastLoginAt ? <LocalTime iso={u.lastLoginAt} /> : "Never"}</td>
                    <td className="px-5 py-3">
                      <div className="flex justify-end gap-1.5">
                        <button type="button" disabled={self} onClick={() => confirmReset(u)} className="rounded-full border border-line px-3 py-1.5 text-xs font-semibold hover:border-brand hover:text-brand disabled:opacity-30">Reset password</button>
                        <button type="button" disabled={self} onClick={() => confirmActive(u)}
                          className={`rounded-full border px-3 py-1.5 text-xs font-semibold disabled:opacity-30 ${u.isActive ? "border-danger-line text-danger hover:bg-danger-soft" : "border-success/40 text-success hover:bg-success-soft"}`}>
                          {u.isActive ? "Deactivate" : "Activate"}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {dialog?.kind === "create" && (
        <Modal title="New user" eyebrow="Administration" onClose={close}>
          <form onSubmit={create} noValidate className="space-y-4">
            <Field label="Full name" name="name" error={fields.name} autoFocus />
            <Field label="Email" name="email" type="email" error={fields.email} />
            <fieldset>
              <legend className="mb-1.5 text-sm font-semibold">Role</legend>
              <div className="grid grid-cols-3 gap-2">
                {ROLES.map((r) => (
                  <label key={r} className="cursor-pointer rounded-xl border border-line px-3 py-2 text-center text-sm font-semibold has-[:checked]:border-brand has-[:checked]:bg-brand has-[:checked]:text-on-brand has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--ring)]">
                    <input type="radio" name="role" value={r} defaultChecked={r === "EXAMINER"} className="sr-only" />{ROLE_LABEL[r]}
                  </label>
                ))}
              </div>
            </fieldset>
            <p className="text-xs text-muted">A unique temporary password is generated. The user must change it at first login.</p>
            {error && <FormAlert>{error}</FormAlert>}
            <div className="flex justify-end gap-2">
              <button type="button" className={btn.secondary} onClick={close}>Cancel</button>
              <button className={btn.primary} disabled={busy}>{busy ? "Creating…" : "Create user"}</button>
            </div>
          </form>
        </Modal>
      )}

      {dialog?.kind === "confirm" && (
        <Modal title={dialog.title} eyebrow="Please confirm" onClose={close}>
          <p className="text-sm leading-relaxed">{dialog.body}</p>
          {error && <div className="mt-4"><FormAlert>{error}</FormAlert></div>}
          <div className="mt-6 flex justify-end gap-2">
            <button type="button" className={btn.secondary} onClick={() => { close(); router.refresh(); }}>Cancel</button>
            <button type="button" autoFocus className={dialog.danger ? btn.danger : btn.primary} disabled={busy} onClick={() => runConfirm(dialog)}>{busy ? "Working…" : dialog.action}</button>
          </div>
        </Modal>
      )}

      {dialog?.kind === "credentials" && (
        <Modal title={dialog.title} eyebrow="Temporary password" onClose={() => setDialog(null)}>
          <CredentialCard name={dialog.name} email={dialog.email} password={dialog.password} note={dialog.note} />
          <div className="mt-6 flex justify-end">
            <button type="button" autoFocus className={btn.primary} onClick={() => setDialog(null)}>Done</button>
          </div>
        </Modal>
      )}
    </>
  );
}
