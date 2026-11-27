"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { signupSchema } from "@/lib/validation/auth";
import { homeFor, postJson, zodFieldErrors, type SessionUser } from "@/lib/client/api";
import { Field, FormAlert, SubmitButton } from "@/components/ui";

export function SignupForm() {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const parsed = signupSchema.safeParse({
      name: form.get("name"),
      email: form.get("email"),
      password: form.get("password"),
    });
    const errs = parsed.success ? {} : zodFieldErrors(parsed.error.issues);
    if (!form.get("confirm")) errs.confirm = "Confirm your password";
    else if (form.get("confirm") !== form.get("password")) errs.confirm = "Passwords do not match";
    setAlert(null);
    setFields(errs);
    if (!parsed.success || Object.keys(errs).length) return;

    setPending(true);
    const res = await postJson<{ user: SessionUser }>("/api/auth/signup", parsed.data);
    if (res.ok) {
      formEl.reset(); // never leave a password sitting in a kept-alive page
      setPending(false);
      router.replace(homeFor(res.data.user));
      router.refresh();
      return;
    }
    setPending(false);
    if (res.error.fields) setFields(res.error.fields);
    else setAlert(res.error.message);
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-3 sm:space-y-4">
      {alert && <FormAlert>{alert}</FormAlert>}
      <Field label="Full name" name="name" autoComplete="name" error={fields.name} autoFocus />
      <Field label="Email" name="email" type="email" autoComplete="email" inputMode="email" placeholder="you@example.com" error={fields.email} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Password" name="password" type="password" autoComplete="new-password" error={fields.password} />
        <Field label="Confirm password" name="confirm" type="password" autoComplete="new-password" error={fields.confirm} />
      </div>
      {!fields.password && <p className="-mt-2 text-xs text-muted">At least 8 characters, with a letter and a number.</p>}
      <SubmitButton pending={pending}>{pending ? "Creating account…" : "Create account"}</SubmitButton>
    </form>
  );
}
