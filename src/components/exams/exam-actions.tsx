"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";
import { FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";

export function ExamActions({ examId, status, canPublish, canUnpublish, canDelete }: { examId: string; status: "DRAFT" | "PUBLISHED"; canPublish: boolean; canUnpublish: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string>();
  const [error, setError] = useState<string>();

  async function act(action: "publish" | "unpublish" | "delete") {
    if (busy) return;
    const ask = {
      publish: "Publish this exam? Enrolled candidates will see it, and the question list will be locked.",
      unpublish: "Unpublish this exam? Candidates will no longer see it until you publish again.",
      delete: "Delete this draft exam permanently? This cannot be undone.",
    }[action];
    if (!confirm(ask)) return;
    setBusy(action);
    setError(undefined);
    let ok: boolean, message = "";
    if (action === "delete") {
      try {
        const res = await fetch(`/api/exams/${examId}`, { method: "DELETE" });
        ok = res.ok;
        if (!ok) message = (await res.json().catch(() => null))?.error?.message ?? "Something went wrong";
      } catch {
        ok = false; message = "Can't reach the server. Try again.";
      }
    } else {
      const r = await postJson(`/api/exams/${examId}/${action}`);
      ok = r.ok;
      if (!r.ok) message = r.error.message;
    }
    setBusy(undefined);
    if (!ok) return setError(message);
    if (action === "delete") router.push("/exams");
    router.refresh();
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" && (
          <button type="button" className={btn.primary} disabled={!canPublish || !!busy} onClick={() => act("publish")}>
            {busy === "publish" ? "Publishing…" : "Publish exam"}
          </button>
        )}
        {canUnpublish && <button type="button" className={btn.secondary} disabled={!!busy} onClick={() => act("unpublish")}>{busy === "unpublish" ? "Unpublishing…" : "Unpublish"}</button>}
        {canDelete && <button type="button" className={btn.danger} disabled={!!busy} onClick={() => act("delete")}>{busy === "delete" ? "Deleting…" : "Delete draft"}</button>}
      </div>
      {status === "DRAFT" && !canPublish && <p className="text-xs text-muted">Fix the items marked ✗ to enable publishing.</p>}
      {error && <FormAlert>{error}</FormAlert>}
    </div>
  );
}
