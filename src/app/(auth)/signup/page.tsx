import Link from "next/link";
import { Suspense } from "react";
import { AuthPage, FormSkeleton } from "@/components/auth-card";
import { SignupForm } from "@/components/forms/signup-form";
import { redirectIfLoggedIn } from "@/lib/auth/page-guards";

export const metadata = { title: "Create account · SecureExam" };

async function Gate() {
  await redirectIfLoggedIn();
  return <SignupForm />;
}

export default function SignupPage() {
  return (
    <AuthPage
      eyebrow="New account"
      title="Create account"
      badge="Candidate"
      intro="For candidates. Your examiner enrolls you in exams; staff accounts are created by an administrator."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className="font-semibold text-brand underline-offset-4 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton fields={4} />}>
        <Gate />
      </Suspense>
    </AuthPage>
  );
}
