import { Suspense } from "react";
import { AuthPage, FormSkeleton } from "@/components/auth-card";
import { ChangePasswordForm } from "@/components/forms/change-password-form";
import { FormAlert } from "@/components/ui";
import { requirePageUser } from "@/lib/auth/page-guards";

export const metadata = { title: "Change password · SecureExam" };

async function Gate() {
  const user = await requirePageUser({ allowPendingPasswordChange: true });
  return (
    <>
      {user.mustChangePassword && (
        <FormAlert tone="notice">
          You signed in with a temporary password. Choose your own password to continue.
        </FormAlert>
      )}
      <ChangePasswordForm />
    </>
  );
}

export default function ChangePasswordPage() {
  return (
    <AuthPage eyebrow="Account security" title="Change password">
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <Gate />
      </Suspense>
    </AuthPage>
  );
}
