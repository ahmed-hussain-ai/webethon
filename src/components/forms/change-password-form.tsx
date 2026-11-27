"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { changePasswordSchema } from "@/lib/validation/auth";
import { postJson, zodFieldErrors, type SessionUser } from "@/lib/client/api";
import { Field, FormAlert, SubmitButton } from "@/components/ui";

export function ChangePasswordForm() {
  const router = useRouter();
  const [fields, setFields] = useState<Record<string, string>>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending) return;
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    const parsed = changePasswordSchema.safeParse({
      currentPassword: form.get("currentPassword"),
      newPassword: form.get("newPassword"),
    });
    const errs = parsed.success ? {} : zodFieldErrors(parsed.error.issues);
    if (!errs.confirm && form.get("confirm") !== form.get("newPassword")) errs.confirm = "Passwords do not match";
    setAlert(null);
    setFields(errs);
    if (!parsed.success || Object.keys(errs).length) return;

    setPending(true);
    const res = await postJson<{ user: SessionUser }>("/api/auth/change-password", parsed.data);
    if (res.ok) {
      formEl.reset(); // never leave a password sitting in a kept-alive page
      setPending(false);
      router.replace("/dashboard");
      router.refresh();
      return;
    }
    setPending(false);
    if (res.error.code === "UNAUTHENTICATED" || res.error.code === "SESSION_CHANGED") {
      router.replace("/login");
      return;
    }
    if (res.error.fields) setFields(res.error.fields);
    else setAlert(res.error.message);
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-5">
      {alert && <FormAlert>{alert}</FormAlert>}
      <Field label="Current password" name="currentPassword" type="password" autoComplete="current-password" error={fields.currentPassword} autoFocus />
      <Field
        label="New password"
        name="newPassword"
        type="password"
        autoComplete="new-password"
        error={fields.newPassword}
        hint="At least 8 characters, with a letter and a number. Must differ from the current one."
      />
      <Field label="Confirm new password" name="confirm" type="password" autoComplete="new-password" error={fields.confirm} />
      <SubmitButton pending={pending}>{pending ? "Saving…" : "Change password"}</SubmitButton>
    </form>
  );
}
