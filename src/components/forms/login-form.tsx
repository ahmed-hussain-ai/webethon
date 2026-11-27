"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { loginSchema } from "@/lib/validation/auth";
import { homeFor, postJson, zodFieldErrors, type SessionUser } from "@/lib/client/api";
import { Field, FormAlert, SubmitButton } from "@/components/ui";

export function LoginForm() {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<{ tone: "error" | "notice"; text: string } | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return; // no double submit
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const parsed = loginSchema.safeParse({ email: form.get("email"), password: form.get("password") });
    setAlert(null);
    if (!parsed.success) return setFields(zodFieldErrors(parsed.error.issues));
    setFields({});

    setPending(true);
    const res = await postJson<{ user: SessionUser }>("/api/auth/login", parsed.data);
    if (res.ok) {
      formEl.reset(); // never leave a password sitting in a kept-alive page
      setPending(false);
      router.replace(homeFor(res.data.user));
      router.refresh();
      return;
    }
    setPending(false);
    if (res.error.fields) setFields(res.error.fields);
    setAlert({ tone: res.error.code === "ACCOUNT_LOCKED" ? "notice" : "error", text: res.error.message });
  }

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-5">
      {alert && <FormAlert tone={alert.tone}>{alert.text}</FormAlert>}
      <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" error={fields.email} autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="current-password" error={fields.password} />
      <SubmitButton pending={pending}>{pending ? "Signing in…" : "Sign in"}</SubmitButton>
      <p className="text-center text-xs text-muted">
        Forgot your password? Contact your examiner or administrator to reset it.
      </p>
    </form>
  );
}
