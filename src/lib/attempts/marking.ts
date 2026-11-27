// Pure marking rules (no database): shared by the grader and unit tests.

export type Snapshot = {
  type: "SINGLE_CHOICE" | "MULTI_SELECT" | "WRITTEN";
  text: string;
  difficulty: string;
  category: string;
  options: { id: string; text: string }[];
  correctOptionIds: string[];
  modelAnswer: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Objective marking (PDF 3.7). Returns null for written questions (examiner / AI review).
 *  - Nothing selected → 0 (never negative: skipping is safe).
 *  - SINGLE_CHOICE: the one correct option → full marks, otherwise −negative.
 *  - MULTI_SELECT, ALL_OR_NOTHING: exactly the correct set → full marks, otherwise −negative.
 *  - MULTI_SELECT, PARTIAL: marks × (correct picked − wrong picked) ÷ total correct;
 *    if that is ≤ 0 → −negative (0 when no negative marking).
 */
export function markObjective(
  snap: Snapshot,
  selected: string[],
  marks: number,
  negative: number,
  rule: "ALL_OR_NOTHING" | "PARTIAL",
): number | null {
  if (snap.type === "WRITTEN") return null;
  const valid = new Set(snap.options.map((o) => o.id));
  const picked = [...new Set(selected.filter((id) => valid.has(id)))];
  if (picked.length === 0) return 0;
  const correct = new Set(snap.correctOptionIds);
  if (snap.type === "SINGLE_CHOICE") {
    return picked.length === 1 && correct.has(picked[0]) ? marks : -negative;
  }
  const cp = picked.filter((id) => correct.has(id)).length;
  const wp = picked.length - cp;
  if (rule === "ALL_OR_NOTHING") return cp === correct.size && wp === 0 ? marks : -negative;
  const fraction = (cp - wp) / correct.size;
  return fraction > 0 ? r2(marks * fraction) : -negative;
}

