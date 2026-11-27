import Link from "next/link";
import { Suspense } from "react";
import { AuthPage, FormSkeleton } from "@/components/auth-card";
import { LoginForm } from "@/components/forms/login-form";
import { redirectIfLoggedIn } from "@/lib/auth/page-guards";

export const metadata = { title: "Sign in · SecureExam" };

async function Gate() {
  await redirectIfLoggedIn();
  return <LoginForm />;
}

export default function LoginPage() {
  return (
    <AuthPage
      eyebrow="Secure access"
      title="Sign in"
      intro="Administrators, examiners and candidates all sign in here."
      footer={
        <>
          New candidate?{" "}
          <Link href="/signup" className="font-semibold text-brand underline-offset-4 hover:underline">
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton />}>
        <Gate />
      </Suspense>
    </AuthPage>
  );
}
