"use client";

import { useCallback, useRef, useState } from "react";
import { Modal } from "@/components/ui";
import { btn } from "@/components/staff-shell";

type Ask = { title: string; body: string; action: string; danger?: boolean };

/**
 * In-app replacement for window.confirm():
 *   const { ask, dialog } = useConfirm();
 *   if (!(await ask({ title, body, action }))) return;
 * and render {dialog} somewhere in the component.
 */
export function useConfirm() {
  const [req, setReq] = useState<Ask | null>(null);
  const resolver = useRef<(v: boolean) => void>(null);

  const ask = useCallback((a: Ask) => new Promise<boolean>((resolve) => { resolver.current = resolve; setReq(a); }), []);
  const done = (v: boolean) => { resolver.current?.(v); resolver.current = null; setReq(null); };

  const dialog = req ? (
    <Modal title={req.title} eyebrow="Please confirm" onClose={() => done(false)}>
      <p className="text-sm leading-relaxed">{req.body}</p>
      <div className="mt-6 flex justify-end gap-2">
        <button type="button" className={btn.secondary} onClick={() => done(false)}>Cancel</button>
        <button type="button" autoFocus className={req.danger ? btn.danger : btn.primary} onClick={() => done(true)}>{req.action}</button>
      </div>
    </Modal>
  ) : null;

  return { ask, dialog };
}
