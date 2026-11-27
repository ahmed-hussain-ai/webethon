"use client";

import { useId, useState, type InputHTMLAttributes, type ReactNode } from "react";

type FieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, "id"> & {
  label: string;
  error?: string;
  hint?: ReactNode;
};

/** Labelled input with inline error + optional hint, wired up for screen readers. */
export function Field({ label, error, hint, type = "text", ...rest }: FieldProps) {
  const id = useId();
  const [show, setShow] = useState(false);
  const isPassword = type === "password";
  const describedBy = [error ? `${id}-err` : null, hint ? `${id}-hint` : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={isPassword && show ? "text" : type}
          aria-invalid={!!error}
          aria-describedby={describedBy}
          className={`w-full rounded-xl border bg-surface-2 px-3.5 py-2.5 text-[0.95rem] leading-tight text-ink placeholder:text-muted/70 transition focus:bg-surface focus:outline-none focus:ring-4 focus:ring-[var(--ring)] ${
            error ? "border-danger" : "border-line focus:border-brand"
          } ${isPassword ? "pr-16" : ""}`}
          {...rest}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShow((s) => !s)}
            aria-label={show ? "Hide password" : "Show password"}
            aria-pressed={show}
            className="absolute inset-y-1.5 right-1.5 rounded-lg px-2.5 text-xs font-semibold text-brand hover:bg-surface"
          >
            {show ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {hint && !error && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-err`} className="flex items-start gap-1.5 text-xs font-medium text-danger">
          <span aria-hidden>●</span>
          {error}
        </p>
      )}
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand px-5 py-3 font-semibold text-on-brand transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-70"
    >
      {pending && (
        <span aria-hidden className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

/** Form-level message (server error, lockout…). Polite live region so it's announced. */
export function FormAlert({ tone = "error", children }: { tone?: "error" | "notice"; children: ReactNode }) {
  const styles =
    tone === "error"
      ? "border-danger-line bg-danger-soft text-danger"
      : "border-notice-line bg-notice text-ink";
  return (
    <div role="alert" className={`rounded-xl border px-4 py-3 text-sm ${styles}`}>
      {children}
    </div>
  );
}

/** Centered dialog card with backdrop. Esc / backdrop click / close button dismiss it. */
export function Modal({ title, eyebrow, onClose, children, wide = false }: { title: string; eyebrow?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  return (
    <div
      className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4 backdrop-blur-[2px]"
      role="dialog" aria-modal="true" aria-labelledby="modal-title"
      onKeyDown={(e) => e.key === "Escape" && onClose()}
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className={`max-h-[90dvh] w-full overflow-y-auto rounded-3xl border border-line bg-surface shadow-2xl ${wide ? "max-w-xl" : "max-w-md"}`}>
        <div className="header-band flex items-start justify-between gap-4 rounded-t-3xl px-6 py-5">
          <div>
            {eyebrow && <p className="eyebrow text-on-header-muted">{eyebrow}</p>}
            <h2 id="modal-title" className="font-display mt-1 text-2xl">{title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="chip grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm hover:bg-white/20">✕</button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}

/** Shows a one-time temporary password with copy-to-clipboard. */
export function CredentialCard({ name, email, password, note }: { name: string; email: string; password: string; note?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(`Email: ${email}\nTemporary password: ${password}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard blocked: the password is still visible to copy by hand */ }
  }
  return (
    <div className="space-y-4">
      {note && <p className="text-sm text-muted">{note}</p>}
      <dl className="space-y-3 rounded-2xl border border-line bg-surface-2 p-4">
        <div><dt className="eyebrow text-muted">Name</dt><dd className="font-semibold">{name}</dd></div>
        <div><dt className="eyebrow text-muted">Email</dt><dd className="font-semibold break-all">{email}</dd></div>
        <div>
          <dt className="eyebrow text-muted">Temporary password</dt>
          <dd className="mt-1 flex items-center gap-3">
            <code className="flex-1 rounded-xl border border-line-strong bg-surface px-4 py-2.5 text-center font-mono text-xl font-bold tracking-wider select-all">{password}</code>
            <button type="button" onClick={copy} className="rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-on-brand hover:bg-brand-hover">{copied ? "Copied ✓" : "Copy"}</button>
          </dd>
        </div>
      </dl>
      <p className="flex gap-2 rounded-xl border border-notice-line bg-notice p-3 text-sm"><span aria-hidden>⚠</span>Shown only once. Share it privately; they must choose a new password when they first sign in.</p>
    </div>
  );
}
