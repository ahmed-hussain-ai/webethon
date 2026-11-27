import Link from "next/link";
import { Suspense } from "react";
import { PageTitle, ShellSkeleton, StaffShell, btn } from "@/components/staff-shell";
import { DifficultyBadge, InactiveBadge, LockBadge, TypeBadge } from "@/components/badges";
import { requirePageRole } from "@/lib/auth/page-guards";
import { listCategories, listQuestions } from "@/lib/questions/service";
import { DIFFICULTIES, DIFFICULTY_LABEL, QUESTION_TYPES, TYPE_LABEL, questionListQuerySchema } from "@/lib/validation/questions";

export const metadata = { title: "Question Bank · SecureExam" };

const selectCls =
  "rounded-xl border border-line bg-surface-2 px-3 py-2 text-sm text-ink focus:border-brand focus:outline-none focus:ring-4 focus:ring-[var(--ring)]";

async function Content({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await requirePageRole("EXAMINER", "ADMIN");
  const raw = Object.fromEntries(Object.entries(await searchParams).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
  const query = questionListQuerySchema.parse(raw);
  const [data, categories] = await Promise.all([listQuestions(user, query), listCategories()]);

  const pageHref = (page: number) => {
    const p = new URLSearchParams(Object.entries({ ...raw, page: String(page) }).filter(([, v]) => v) as [string, string][]);
    return `/questions?${p}`;
  };
  const filtered = Boolean(query.q || query.category || query.type || query.difficulty || query.mine || query.status !== "active");

  return (
    <StaffShell user={user} active="questions">
      <PageTitle
        eyebrow="Question bank"
        title="Questions"
        actions={
          <>
            <Link href="/questions/import" className={btn.secondary}>Import CSV / JSON</Link>
            <Link href="/questions/new" className={btn.primary}>+ New question</Link>
          </>
        }
      />

      <form method="get" role="search" className="mb-5 grid gap-3 rounded-2xl border border-line bg-surface p-4 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto_auto_auto_auto]">
        <label className="sr-only" htmlFor="q">Search question text</label>
        <input id="q" name="q" defaultValue={query.q ?? ""} placeholder="Search question text…" className={`${selectCls} w-full`} />
        <label className="sr-only" htmlFor="category">Category</label>
        <select id="category" name="category" defaultValue={query.category ?? ""} className={selectCls}>
          <option value="">All categories</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <label className="sr-only" htmlFor="type">Type</label>
        <select id="type" name="type" defaultValue={query.type ?? ""} className={selectCls}>
          <option value="">All types</option>
          {QUESTION_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
        </select>
        <label className="sr-only" htmlFor="difficulty">Difficulty</label>
        <select id="difficulty" name="difficulty" defaultValue={query.difficulty ?? ""} className={selectCls}>
          <option value="">Any difficulty</option>
          {DIFFICULTIES.map((d) => <option key={d} value={d}>{DIFFICULTY_LABEL[d]}</option>)}
        </select>
        <label className="sr-only" htmlFor="status">Status</label>
        <select id="status" name="status" defaultValue={query.status} className={selectCls}>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="all">All</option>
        </select>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm whitespace-nowrap">
            <input type="checkbox" name="mine" value="1" aria-label="Mine only" defaultChecked={!!query.mine} className="h-4 w-4 accent-[var(--brand)]" />
            Mine only
          </label>
          <button type="submit" className={btn.primary}>Filter</button>
        </div>
      </form>

      <div className="mb-3 flex items-center justify-between text-sm text-muted">
        <p aria-live="polite">
          {data.total} question{data.total === 1 ? "" : "s"}
          {filtered && (data.total === 1 ? " matches these filters" : " match these filters")}
        </p>
        {filtered && <Link href="/questions" className="font-semibold text-brand hover:underline">Clear filters</Link>}
      </div>

      {data.items.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-line-strong bg-surface px-6 py-14 text-center">
          <p className="font-display text-xl">{filtered ? "No questions match" : "The bank is empty"}</p>
          <p className="mt-2 text-sm text-muted">
            {filtered ? "Try different filters." : "Add a question or import a CSV/JSON file to get started."}
          </p>
        </div>
      ) : (
        <ul className="overflow-hidden rounded-3xl border border-line bg-surface">
          {data.items.map((q, i) => (
            <li key={q.id} className={i ? "border-t border-line" : ""}>
              <Link href={`/questions/${q.id}`} className="group grid gap-2 px-5 py-4 transition hover:bg-surface-2 sm:grid-cols-[1fr_auto] sm:items-center sm:gap-6">
                <div className="min-w-0">
                  <p className={`line-clamp-2 font-medium group-hover:text-brand ${q.isActive ? "" : "text-muted"}`}>{q.text}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <TypeBadge type={q.type} />
                    <DifficultyBadge difficulty={q.difficulty} />
                    {q.locked && <LockBadge />}
                    {!q.isActive && <InactiveBadge />}
                    <span className="text-xs text-muted">
                      · {q.category.name} · by {q.createdByName}
                      {q.usedIn > 0 && ` · used in ${q.usedIn} exam${q.usedIn === 1 ? "" : "s"}`}
                    </span>
                  </div>
                </div>
                <p className="font-mono text-sm text-muted sm:text-right">
                  <span className="text-lg font-semibold text-ink">{q.marks}</span> mark{q.marks === 1 ? "" : "s"}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {data.pages > 1 && (
        <nav aria-label="Pages" className="mt-5 flex items-center justify-center gap-3 text-sm">
          {data.page > 1 ? <Link className={btn.secondary} href={pageHref(data.page - 1)}>← Previous</Link> : <span />}
          <span className="font-mono text-muted">Page {data.page} of {data.pages}</span>
          {data.page < data.pages ? <Link className={btn.secondary} href={pageHref(data.page + 1)}>Next →</Link> : <span />}
        </nav>
      )}
    </StaffShell>
  );
}

export default function QuestionsPage(props: PageProps<"/questions">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <Content searchParams={props.searchParams} />
    </Suspense>
  );
}
