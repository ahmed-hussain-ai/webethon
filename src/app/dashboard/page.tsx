import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ShellSkeleton, StaffShell } from "@/components/staff-shell";
import { LocalTime } from "@/components/local-time";
import { PhaseBadge } from "@/components/exams/phase-badge";
import { requirePageUser } from "@/lib/auth/page-guards";
import { adminDashboard, examinerDashboard } from "@/lib/dashboard/service";

export const metadata = { title: "Dashboard · Examora" };

type ExamRow = Awaited<ReturnType<typeof examinerDashboard>>["exams"]["rows"][number];

function Stat({ label, value, sub, href, tone }: { label: string; value: ReactNode; sub?: ReactNode; href?: string; tone?: "alert" | "ok" }) {
  const body = (
    <div className={`h-full rounded-3xl border bg-surface p-5 transition ${href ? "hover:border-brand" : ""} ${tone === "alert" ? "border-[#e0a030]" : "border-line"}`}>
      <p className="eyebrow text-muted">{label}</p>
      <p className={`mt-2 font-mono text-4xl font-semibold ${tone === "alert" ? "text-[#b7791f]" : tone === "ok" ? "text-success" : ""}`}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted">{sub}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="overflow-hidden rounded-3xl border border-line bg-surface">
      <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-4">
        <h2 className="font-display text-xl">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function ExamList({ rows, empty, admin }: { rows: ExamRow[]; empty: string; admin?: boolean }) {
  if (!rows.length) return <p className="px-5 py-8 text-center text-sm text-muted">{empty}</p>;
  return (
    <ul className="divide-y divide-[var(--border)]">
      {rows.map((e) => (
        <li key={e.id}>
          <Link href={e.phase === "ONGOING" || e.phase === "COMPLETED" ? `/exams/${e.id}/results` : `/exams/${e.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-surface-2">
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{e.title}</p>
              <p className="text-xs text-muted">
                {e.phase === "ONGOING" ? <>Closes <LocalTime iso={e.endAt} /></> : e.phase === "SCHEDULED" ? <>Opens <LocalTime iso={e.startAt} /></> : <>Ended <LocalTime iso={e.endAt} /></>}
                {admin && <> · {e.owner}</>} · {e.enrolled} enrolled
              </p>
            </div>
            {e.phase === "ONGOING" && <span className="flex items-center gap-1.5 rounded-full bg-success-soft px-2.5 py-1 text-xs font-bold text-success"><span aria-hidden className="h-2 w-2 animate-pulse rounded-full bg-success" />{e.writing} writing</span>}
            {e.toMark > 0 && <span className="rounded-full bg-notice px-2.5 py-1 text-xs font-bold">{e.toMark} to mark</span>}
            <PhaseBadge phase={e.phase} />
          </Link>
        </li>
      ))}
    </ul>
  );
}

const quick = "flex items-center gap-3 rounded-2xl border border-line bg-surface p-4 text-sm font-semibold transition hover:border-brand hover:text-brand";

async function AdminHome({ user }: { user: { name: string; role: "ADMIN" } }) {
  const d = await adminDashboard();
  const p = d.exams.phases;
  return (
    <>
      <div className="mb-6 overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="header-band flex flex-wrap items-end justify-between gap-4 px-6 py-6">
          <div>
            <p className="eyebrow text-on-header-muted">Administrator</p>
            <h1 className="font-display mt-1 text-3xl">Welcome back, {user.name.split(" ")[0]}</h1>
            <p className="mt-1 text-sm text-on-header-muted">Platform overview: users, exams and everything that needs attention.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/admin/users" className="chip-active rounded-full px-4 py-2 text-sm font-semibold">Manage users</Link>
            <Link href="/exams" className="chip rounded-full px-4 py-2 text-sm font-semibold hover:bg-white/15">All exams</Link>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Users" value={d.users.total} sub={<>{d.users.admins} admin · {d.users.examiners} examiners · {d.users.candidates} candidates</>} href="/admin/users" />
        <Stat label="Live exams" value={p.ONGOING} sub={<>{d.attempts.inProgress} candidates writing now</>} tone={p.ONGOING ? "ok" : undefined} />
        <Stat label="Answers to mark" value={d.exams.toMark} sub="written answers awaiting a mark" tone={d.exams.toMark ? "alert" : undefined} />
        <Stat label="Open disputes" value={d.openDisputes} sub="waiting for an examiner" tone={d.openDisputes ? "alert" : undefined} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {([["Draft", p.DRAFT], ["Upcoming", p.SCHEDULED], ["Ongoing", p.ONGOING], ["Completed", p.COMPLETED]] as const).map(([k, v]) => (
          <div key={k} className="rounded-2xl border border-line bg-surface px-4 py-3">
            <p className="eyebrow text-muted">{k} exams</p>
            <div className="mt-1 flex items-end justify-between"><span className="font-mono text-2xl font-semibold">{v}</span>
              <span className="h-1.5 w-16 overflow-hidden rounded-full bg-line"><span className="block h-full bg-brand" style={{ width: `${(v / Math.max(1, d.exams.rows.length)) * 100}%` }} /></span></div>
          </div>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title="Live now"><ExamList rows={d.exams.live} empty="No exam is running right now." admin /></Panel>
          <Panel title="Coming up"><ExamList rows={d.exams.upcoming} empty="Nothing scheduled." admin /></Panel>
          {d.exams.awaiting.length > 0 && <Panel title="Results not published yet"><ExamList rows={d.exams.awaiting} empty="" admin /></Panel>}
        </div>
        <div className="space-y-6">
          <Panel title="Account health">
            <ul className="divide-y divide-[var(--border)] text-sm">
              <li className="flex justify-between px-5 py-3"><span>New this week</span><strong className="font-mono">{d.users.newThisWeek}</strong></li>
              <li className="flex justify-between px-5 py-3"><span>Waiting to set their password</span><strong className="font-mono">{d.users.pendingPw}</strong></li>
              <li className="flex justify-between px-5 py-3"><span>Deactivated</span><strong className="font-mono">{d.users.inactive}</strong></li>
              <li className="flex justify-between px-5 py-3"><span>Questions in the bank</span><strong className="font-mono">{d.bankSize}</strong></li>
              <li className="flex justify-between px-5 py-3"><span>Attempts recorded</span><strong className="font-mono">{d.attempts.total}</strong></li>
            </ul>
          </Panel>
          <Panel title="Recent activity">
            {d.activity.length ? (
              <ol className="divide-y divide-[var(--border)] text-sm">
                {d.activity.map((a) => (
                  <li key={a.id} className="flex gap-3 px-5 py-3">
                    <span aria-hidden className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-brand" />
                    <span className="flex-1"><strong>{a.who}</strong> {a.what}<span className="block text-xs text-muted"><LocalTime iso={a.at} /></span></span>
                  </li>
                ))}
              </ol>
            ) : <p className="px-5 py-8 text-center text-sm text-muted">No activity recorded yet.</p>}
          </Panel>
          <Panel title="Recent sign-ins">
            <ul className="divide-y divide-[var(--border)] text-sm">
              {d.logins.map((u) => (
                <li key={u.id} className="flex items-center justify-between gap-3 px-5 py-2.5">
                  <span><strong>{u.name}</strong> <span className="text-xs text-muted">· {u.role.toLowerCase()}</span></span>
                  <span className="text-xs text-muted"><LocalTime iso={u.lastLoginAt} /></span>
                </li>
              ))}
            </ul>
          </Panel>
        </div>
      </div>
    </>
  );
}

async function ExaminerHome({ user }: { user: Parameters<typeof examinerDashboard>[0] }) {
  const d = await examinerDashboard(user);
  const p = d.exams.phases;
  return (
    <>
      <div className="mb-6 overflow-hidden rounded-3xl border border-line bg-surface">
        <div className="header-band flex flex-wrap items-end justify-between gap-4 px-6 py-6">
          <div>
            <p className="eyebrow text-on-header-muted">Examiner</p>
            <h1 className="font-display mt-1 text-3xl">Welcome back, {user.name.split(" ")[0]}</h1>
            <p className="mt-1 text-sm text-on-header-muted">Your exams at a glance.</p>
          </div>
          <Link href="/exams" className="chip-active rounded-full px-4 py-2 text-sm font-semibold">+ New exam</Link>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Live now" value={p.ONGOING} sub={<>{d.exams.live.reduce((s, e) => s + e.writing, 0)} candidates writing</>} tone={p.ONGOING ? "ok" : undefined} />
        <Stat label="Upcoming" value={p.SCHEDULED} sub={`${p.DRAFT} draft${p.DRAFT === 1 ? "" : "s"}`} href="/exams" />
        <Stat label="Answers to mark" value={d.exams.toMark} sub="written answers" tone={d.exams.toMark ? "alert" : undefined} />
        <Stat label="Open disputes" value={d.openDisputes} sub="need your response" tone={d.openDisputes ? "alert" : undefined} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Panel title="Live now"><ExamList rows={d.exams.live} empty="None of your exams is running right now." /></Panel>
          <Panel title="Coming up"><ExamList rows={d.exams.upcoming} empty="Nothing scheduled. Create an exam and publish it." /></Panel>
          {d.exams.awaiting.length > 0 && <Panel title="Ready to mark & publish"><ExamList rows={d.exams.awaiting} empty="" /></Panel>}
        </div>
        <Panel title="Quick actions">
          <div className="grid gap-3 p-5">
            <Link href="/exams" className={quick}><span aria-hidden className="text-xl">📝</span>Create or manage exams</Link>
            <Link href="/questions/new" className={quick}><span aria-hidden className="text-xl">➕</span>Add a question</Link>
            <Link href="/questions/import" className={quick}><span aria-hidden className="text-xl">📥</span>Import questions (CSV / JSON)</Link>
            <Link href="/questions?mine=1" className={quick}><span aria-hidden className="text-xl">📚</span>My questions <span className="ml-auto font-mono text-muted">{d.myQuestions}</span></Link>
          </div>
        </Panel>
      </div>
    </>
  );
}

async function Content() {
  const user = await requirePageUser();
  if (user.role === "CANDIDATE") redirect("/my-exams"); // candidates' home is their exam list
  return (
    <StaffShell user={user} active="dashboard">
      {user.role === "ADMIN" ? <AdminHome user={{ name: user.name, role: "ADMIN" }} /> : <ExaminerHome user={user} />}
    </StaffShell>
  );
}

export default function DashboardPage() {
  return <Suspense fallback={<ShellSkeleton />}><Content /></Suspense>;
}
