import { Suspense } from "react";
import { SiteHeader } from "@/components/site-header";
import { LogoutButton } from "@/components/logout-button";
import { requirePageUser } from "@/lib/auth/page-guards";
import { StaffShell } from "@/components/staff-shell";

export const metadata = { title: "Dashboard · SecureExam" };

const ROLE_LABEL = { ADMIN: "Administrator", EXAMINER: "Examiner", CANDIDATE: "Candidate" } as const;

async function RoleCard() {
  // Role comes from the database row of the logged-in user, never from the browser.
  const user = await requirePageUser();
  const card = (
    <section aria-labelledby="role-title" className="overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="header-band flex items-center justify-between gap-4 px-6 py-6 sm:px-8">
        <div>
          <p className="eyebrow text-on-header-muted">Signed in as</p>
          <h1 id="role-title" className="font-display mt-1 text-3xl sm:text-4xl">
            {ROLE_LABEL[user.role]}
          </h1>
        </div>
        <span className="chip-active rounded-full px-4 py-2 font-mono text-sm font-bold">{user.role}</span>
      </div>
      <dl className="grid gap-px bg-line sm:grid-cols-2">
        <div className="bg-surface px-6 py-5 sm:px-8">
          <dt className="eyebrow text-muted">Name</dt>
          <dd className="mt-1 font-semibold">{user.name}</dd>
        </div>
        <div className="bg-surface px-6 py-5 sm:px-8">
          <dt className="eyebrow text-muted">Email</dt>
          <dd className="mt-1 font-semibold break-all">{user.email}</dd>
        </div>
      </dl>
    </section>
  );
  if (user.role !== "CANDIDATE") {
    return (
      <StaffShell user={user} active="dashboard">
        {card}
      </StaffShell>
    );
  }
  return (
    <>
      <SiteHeader>
        <p className="hidden font-mono text-sm sm:block">
          <span className="text-on-header-muted">Welcome :</span> {user.name}
        </p>
        <LogoutButton />
      </SiteHeader>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10">{card}</main>
    </>
  );
}

function Loading() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-10" aria-busy="true">
        <div className="h-48 animate-pulse rounded-3xl bg-surface" />
      </main>
    </>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<Loading />}>
      <RoleCard />
    </Suspense>
  );
}
