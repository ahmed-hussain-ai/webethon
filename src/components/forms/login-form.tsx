"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { loginSchema } from "@/lib/validation/auth";
import { homeFor, postJson, zodFieldErrors, type SessionUser } from "@/lib/client/api";
import { Field, FormAlert, SubmitButton } from "@/components/ui";

// Demo builds (NEXT_PUBLIC_DEMO_ACCOUNTS=true) show one-click test accounts for judges.
const DEMO = process.env.NEXT_PUBLIC_DEMO_ACCOUNTS === "true";
const DEMO_ACCOUNTS = [["Administrator", "admin@exam.test"], ["Examiner", "examiner@exam.test"], ["Candidate", "candidate1@exam.test"]] as const;
function fillDemo(form: HTMLFormElement | null, email: string) {
  if (!form) return;
  (form.elements.namedItem("email") as HTMLInputElement).value = email;
  (form.elements.namedItem("password") as HTMLInputElement).value = "Password@123";
  form.requestSubmit();
}

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
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-3 sm:space-y-4">
      {alert && <FormAlert tone={alert.tone}>{alert.text}</FormAlert>}
      <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" error={fields.email} autoFocus />
      <Field label="Password" name="password" type="password" autoComplete="current-password" error={fields.password} />
      <SubmitButton pending={pending}>{pending ? "Signing in…" : "Sign in"}</SubmitButton>
      {DEMO && (
        <div className="border-t border-line pt-3">
          <p className="mb-2 text-xs font-semibold text-muted">Demo accounts: click to fill</p>
          <div className="flex flex-wrap gap-2">
            {DEMO_ACCOUNTS.map(([label, email]) => (
              <button key={email} type="button" onClick={(e) => fillDemo(e.currentTarget.form, email)}
                className="rounded-full border border-line px-3 py-1 text-xs font-semibold hover:border-brand hover:text-brand">{label}</button>
            ))}
          </div>
        </div>
      )}
      <p className="text-center text-xs text-muted">
        Forgot your password? Ask your administrator to reset it.
      </p>
    </form>
  );
}
