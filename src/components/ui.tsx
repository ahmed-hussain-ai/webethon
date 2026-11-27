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
          className={`w-full rounded-xl border bg-surface-2 px-3.5 py-2.5 text-[0.95rem] text-ink placeholder:text-muted/70 transition focus:bg-surface focus:outline-none focus:ring-4 focus:ring-[var(--ring)] ${
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
