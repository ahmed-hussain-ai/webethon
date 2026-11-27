"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { postJson } from "@/lib/client/api";
import { FormAlert } from "@/components/ui";
import { btn } from "@/components/staff-shell";

/** Duplicate (anyone on staff) and deactivate/reactivate (owner or admin). */
export function QuestionActions({ id, isActive, canEdit }: { id: string; isActive: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(action: "duplicate" | "deactivate" | "reactivate") {
    if (busy) return;
    if (action === "deactivate" && !confirm("Deactivate this question? It disappears from the exam builder, but exams that already use it keep it.")) return;
    setBusy(action);
    setError(null);
    const res = await postJson<{ id?: string }>(`/api/questions/${id}/${action}`);
    setBusy(null);
    if (!res.ok) return setError(res.error.message);
    if (action === "duplicate" && res.data.id) router.push(`/questions/${res.data.id}?copied=1`);
    router.refresh();
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={btn.secondary} onClick={() => run("duplicate")} disabled={!!busy}>
          {busy === "duplicate" ? "Duplicating…" : "Duplicate"}
        </button>
        {canEdit &&
          (isActive ? (
            <button type="button" className={btn.danger} onClick={() => run("deactivate")} disabled={!!busy}>
              {busy === "deactivate" ? "Deactivating…" : "Deactivate"}
            </button>
          ) : (
            <button type="button" className={btn.primary} onClick={() => run("reactivate")} disabled={!!busy}>
              {busy === "reactivate" ? "Reactivating…" : "Reactivate"}
            </button>
          ))}
      </div>
      {error && <FormAlert>{error}</FormAlert>}
    </div>
  );
}
