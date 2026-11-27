"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";
import { FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";
import { useConfirm } from "@/components/confirm-dialog";

/** AI check / accept suggestions / publish: used on the exam results page and per attempt. */
export function ResultsActions({
  examId, attemptId, aiEnabled, aiAvailable, canPublish, published, showPublish = true,
}: { examId: string; attemptId?: string; aiEnabled: boolean; aiAvailable: boolean; canPublish: boolean; published: boolean; showPublish?: boolean }) {
  const { ask, dialog } = useConfirm();
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [msg, setMsg] = useState<{ tone: "error" | "notice"; text: string }>();

  async function run(kind: "ai-check" | "ai-accept" | "publish") {
    if (busy) return;
    if (kind === "publish" && !(await ask({ title: "Publish results?", body: "Candidates will see their scores. After this, marks can only change through a dispute.", action: "Publish results" }))) return;
    setBusy(kind);
    setMsg(undefined);
    const url = kind === "publish" ? `/api/exams/${examId}/results/publish` : `/api/exams/${examId}/${kind}`;
    const r = await postJson<{ checked?: number; failed?: number; accepted?: number }>(url, kind === "publish" ? undefined : { attemptId });
    setBusy(undefined);
    if (!r.ok) return setMsg({ tone: "error", text: r.error.message });
    if (kind === "ai-check") setMsg({ tone: "notice", text: `AI suggested marks for ${r.data.checked} answer(s)${r.data.failed ? `; ${r.data.failed} failed (mark those manually)` : ""}. Review them, then accept.` });
    if (kind === "ai-accept") setMsg({ tone: "notice", text: `Accepted ${r.data.accepted} AI suggestion(s). Flagged answers still need your mark.` });
    if (kind === "publish") setMsg({ tone: "notice", text: "Results published. Candidates can now see their scores." });
    router.refresh();
  }

  if (published) return null;
  return (
    <>
    {dialog}
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {aiEnabled && aiAvailable && (
          <>
            <button type="button" className={btn.secondary} disabled={!!busy} onClick={() => run("ai-check")}>{busy === "ai-check" ? "Checking with AI…" : "Suggest marks with AI"}</button>
            <button type="button" className={btn.secondary} disabled={!!busy} onClick={() => run("ai-accept")}>{busy === "ai-accept" ? "Accepting…" : "Accept AI suggestions"}</button>
          </>
        )}
        {showPublish && <button type="button" className={btn.primary} disabled={!canPublish || !!busy} onClick={() => run("publish")}>{busy === "publish" ? "Publishing…" : "Publish results"}</button>}
      </div>
      {aiEnabled && !aiAvailable && <p className="text-xs text-muted">AI checking isn&apos;t configured on this server (LLM_API_KEY), so mark written answers manually.</p>}
      {!aiEnabled && <p className="text-xs text-muted">AI checking is off for this exam: written answers are marked manually.</p>}
      {msg && <FormAlert tone={msg.tone}>{msg.text}</FormAlert>}
    </div>
    </>
  );
}
