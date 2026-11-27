import Link from "next/link";
import { Suspense } from "react";
import { PageTitle, ShellSkeleton, StaffShell, btn } from "@/components/staff-shell";
import { UserManager } from "@/components/admin/user-manager";
import { requirePageRole } from "@/lib/auth/page-guards";
import { listUsers, userListSchema } from "@/lib/users/service";

export const metadata = { title: "Users · SecureExam" };
const sel = "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]";

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageRole("ADMIN");
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const q = userListSchema.parse(raw);
  const data = await listUsers(q);
  const href = (page: number) => `/admin/users?${new URLSearchParams(Object.entries({ ...raw, page: String(page) }).filter(([, v]) => v) as [string, string][])}`;
  return (
    <StaffShell user={user} active="users">
      <PageTitle eyebrow="Administration" title="Users" />
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-line bg-surface px-4 py-3"><p className="eyebrow text-muted">All users</p><p className="font-mono text-2xl font-semibold">{Object.values(data.counts).reduce((s, n) => s + n, 0)}</p></div>
        {(["ADMIN", "EXAMINER", "CANDIDATE"] as const).map((r) => (
          <Link key={r} href={`/admin/users?role=${r}`} className="rounded-2xl border border-line bg-surface px-4 py-3 hover:border-brand"><p className="eyebrow text-muted">{r.toLowerCase()}s</p><p className="font-mono text-2xl font-semibold">{data.counts[r] ?? 0}</p></Link>
        ))}
      </div>
      <UserManager users={data.users} me={user.id} filters={
      <form method="get" role="search" className="flex flex-wrap gap-3 rounded-2xl border border-line bg-surface p-3">
        <input name="q" defaultValue={q.q ?? ""} placeholder="Search name or email…" aria-label="Search" className={`${sel} min-w-56 flex-1`} />
        <select name="role" defaultValue={q.role ?? ""} aria-label="Role" className={sel}><option value="">All roles</option><option value="ADMIN">Admins</option><option value="EXAMINER">Examiners</option><option value="CANDIDATE">Candidates</option></select>
        <select name="status" defaultValue={q.status ?? ""} aria-label="Status" className={sel}><option value="">Any status</option><option value="active">Active</option><option value="inactive">Deactivated</option></select>
        <button className={btn.primary}>Filter</button>
      </form>
      } />
      {data.pages > 1 && (
        <nav aria-label="Pages" className="mt-5 flex items-center justify-center gap-3 text-sm">
          {data.page > 1 && <Link className={btn.secondary} href={href(data.page - 1)}>← Previous</Link>}
          <span className="font-mono text-muted">Page {data.page} of {data.pages}</span>
          {data.page < data.pages && <Link className={btn.secondary} href={href(data.page + 1)}>Next →</Link>}
        </nav>
      )}
    </StaffShell>
  );
}

export default function UsersPage(props: PageProps<"/admin/users">) {
  return <Suspense fallback={<ShellSkeleton />}><Content searchParams={props.searchParams} /></Suspense>;
}
