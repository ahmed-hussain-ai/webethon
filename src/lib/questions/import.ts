import "server-only";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import { normaliseText, questionInputSchema, MAX_OPTIONS, type QuestionInput } from "@/lib/validation/questions";

export const IMPORT_MAX_BYTES = 1_000_000;
export const IMPORT_MAX_ROWS = 500;
const LETTERS = "ABCDEFGHIJ".slice(0, MAX_OPTIONS).split("");
const PLACEHOLDER_CATEGORY = "00000000-0000-4000-8000-000000000000";

type RowIssue = { row: number; message: string };
type ParsedRow = { row: number; input: QuestionInput; categoryName: string };

const TYPE_ALIASES: Record<string, QuestionInput["type"]> = {
  single: "SINGLE_CHOICE", single_choice: "SINGLE_CHOICE", singlechoice: "SINGLE_CHOICE", mcq: "SINGLE_CHOICE",
  multi: "MULTI_SELECT", multiple: "MULTI_SELECT", multi_select: "MULTI_SELECT", multiselect: "MULTI_SELECT", multiple_select: "MULTI_SELECT",
  written: "WRITTEN", text: "WRITTEN", essay: "WRITTEN", short_answer: "WRITTEN",
};
const s = (v: unknown) => (v === undefined || v === null ? "" : String(v)).trim();

/** One raw record (CSV row or JSON object) → canonical shape, or a list of problems. */
function toCanonical(rec: Record<string, unknown>): { value?: Record<string, unknown>; categoryName: string; problems: string[] } {
  const problems: string[] = [];
  const typeKey = s(rec.type).toLowerCase().replace(/[\s-]+/g, "_");
  const type = TYPE_ALIASES[typeKey];
  if (!type) problems.push(`Unknown type "${s(rec.type)}" (use single, multi or written)`);
  const categoryName = s(rec.category).replace(/\s+/g, " ");
  if (!categoryName) problems.push("Category is required");
  else if (categoryName.length > 80) problems.push("Category name is too long (max 80)");

  // Options: JSON may give options:[{text,isCorrect}]; CSV gives option_a..option_j + correct="A;C".
  let options: { text: string; isCorrect: boolean }[] = [];
  if (Array.isArray(rec.options)) {
    options = rec.options.map((o) =>
      typeof o === "string"
        ? { text: o.trim(), isCorrect: false }
        : { text: s((o as Record<string, unknown>)?.text), isCorrect: (o as Record<string, unknown>)?.isCorrect === true || (o as Record<string, unknown>)?.correct === true },
    );
  } else {
    const filled = LETTERS.map((L) => s(rec[`option_${L.toLowerCase()}`]));
    const last = filled.findLastIndex((t) => t !== "");
    for (let i = 0; i <= last; i++) {
      if (!filled[i]) problems.push(`Option ${LETTERS[i]} is empty but a later option is filled`);
    }
    options = filled.slice(0, last + 1).map((text) => ({ text, isCorrect: false }));
  }
  const correctRaw = s(rec.correct).toUpperCase();
  if (correctRaw) {
    const letters = correctRaw.split(/[\s;,|]+/).filter(Boolean);
    for (const L of letters) {
      const i = LETTERS.indexOf(L);
      if (i < 0 || i >= options.length || !options[i].text) problems.push(`Correct answer "${L}" doesn't match a filled option`);
      else options[i].isCorrect = true;
    }
  }
  if (type === "WRITTEN" && (options.length || correctRaw)) {
    problems.push("Written questions cannot have options or a correct letter. Put the correct answer in model_answer");
  }

  return {
    categoryName,
    problems,
    value: {
      type,
      categoryId: PLACEHOLDER_CATEGORY,
      difficulty: s(rec.difficulty).toUpperCase(),
      marks: s(rec.marks),
      text: s(rec.text),
      explanation: s(rec.explanation) || null,
      modelAnswer: s(rec.model_answer ?? rec.modelAnswer) || null,
      options: type === "WRITTEN" ? [] : options,
    },
  };
}

function readRecords(format: "csv" | "json", content: string): { records: { row: number; rec: Record<string, unknown> }[]; fileError?: string } {
  const text = content.replace(/^﻿/, "");
  if (format === "json") {
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      return { records: [], fileError: "The file is not valid JSON" };
    }
    const arr = Array.isArray(data) ? data : (data as { questions?: unknown })?.questions;
    if (!Array.isArray(arr)) return { records: [], fileError: 'JSON must be an array of questions (or { "questions": [...] })' };
    return { records: arr.map((rec, i) => ({ row: i + 1, rec: (rec ?? {}) as Record<string, unknown> })) };
  }
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: "greedy",
    transformHeader: (h) => h.trim().toLowerCase().replace(/[\s-]+/g, "_"),
  });
  const fields = parsed.meta.fields ?? [];
  const missing = ["type", "category", "difficulty", "marks", "text"].filter((f) => !fields.includes(f));
  if (missing.length) return { records: [], fileError: `Missing column(s): ${missing.join(", ")}. Download the template to see the format.` };
  const bad = parsed.errors.find((e) => e.type === "Quotes");
  if (bad) return { records: [], fileError: `Broken quotes near row ${(bad.row ?? 0) + 2}` };
  // Row numbers match what the user sees in a spreadsheet (header = row 1).
  return { records: parsed.data.map((rec, i) => ({ row: i + 2, rec })) };
}

export async function analyseImport(format: "csv" | "json", content: string) {
  if (new TextEncoder().encode(content).length > IMPORT_MAX_BYTES) {
    throw new ApiError(413, "FILE_TOO_LARGE", "File is larger than 1 MB. Split it into smaller files.");
  }
  const { records, fileError } = readRecords(format, content);
  if (fileError) throw new ApiError(400, "INVALID_FILE", fileError);
  if (!records.length) throw new ApiError(400, "INVALID_FILE", "The file has no questions");
  if (records.length > IMPORT_MAX_ROWS) {
    throw new ApiError(400, "TOO_MANY_ROWS", `The file has ${records.length} questions; the limit is ${IMPORT_MAX_ROWS} per import.`);
  }

  const errors: RowIssue[] = [];
  const warnings: RowIssue[] = [];
  const valid: ParsedRow[] = [];
  const seenInFile = new Map<string, number>();

  for (const { row, rec } of records) {
    const c = toCanonical(rec);
    const result = questionInputSchema.safeParse(c.value);
    const problems = [...c.problems];
    if (!result.success) {
      for (const issue of result.error.issues) {
        if (issue.path[0] === "type" && c.problems.some((p) => p.startsWith("Unknown type"))) continue;
        // Already reported as "Option X is empty but a later option is filled".
        if (issue.path[0] === "options" && issue.path[2] === "text" && c.problems.some((p) => p.includes("is empty but"))) continue;
        const where =
          issue.path[0] === "options" && typeof issue.path[1] === "number" ? `Option ${LETTERS[issue.path[1]]}: `
          : issue.path[0] === "modelAnswer" ? "model_answer column: " : "";
        problems.push(where + issue.message);
      }
    }
    const key = `${normaliseText(s(rec.text))}|${c.categoryName.toLowerCase()}`;
    if (s(rec.text) && seenInFile.has(key)) problems.push(`Same question as row ${seenInFile.get(key)}`);
    else if (s(rec.text)) seenInFile.set(key, row);

    if (problems.length) for (const m of [...new Set(problems)]) errors.push({ row, message: m });
    else if (result.success) valid.push({ row, input: result.data, categoryName: c.categoryName });
  }

  // Categories: match existing names ignoring case/extra spaces; the rest will be created.
  const existing = await db.category.findMany({ select: { id: true, name: true } });
  const byName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const displayName = new Map(existing.map((c) => [c.name.trim().toLowerCase(), c.name]));
  const newCategories = [...new Map(valid.filter((v) => !byName.has(v.categoryName.toLowerCase())).map((v) => [v.categoryName.toLowerCase(), v.categoryName])).values()];

  // Already in the bank → warning only (it may be intentional).
  if (valid.length) {
    const bank = await db.question.findMany({ select: { text: true } });
    const bankTexts = new Set(bank.map((b) => normaliseText(b.text)));
    for (const v of valid) if (bankTexts.has(normaliseText(v.input.text))) warnings.push({ row: v.row, message: "A question with the same text already exists in the bank" });
  }

  return {
    total: records.length,
    validCount: valid.length,
    errors,
    warnings,
    newCategories,
    preview: valid.slice(0, 50).map((v) => ({
      row: v.row, type: v.input.type, category: displayName.get(v.categoryName.toLowerCase()) ?? v.categoryName, difficulty: v.input.difficulty,
      marks: v.input.marks, text: v.input.text, options: v.input.type === "WRITTEN" ? 0 : v.input.options.length,
    })),
    _valid: valid,
    _byName: byName,
  };
}

/** All-or-nothing: any row error → nothing is imported. Re-validates; never trusts the dry run. */
export async function commitImport(actor: CurrentUser, format: "csv" | "json", content: string) {
  const a = await analyseImport(format, content);
  if (a.errors.length) {
    const rows = new Set(a.errors.map((e) => e.row)).size;
    throw new ApiError(400, "IMPORT_HAS_ERRORS", `${rows} row(s) have errors. Fix them and upload again; nothing was imported.`);
  }
  const created = await db.$transaction(
    async (tx) => {
      const ids = new Map(a._byName);
      for (const name of a.newCategories) {
        const key = name.toLowerCase();
        // Someone may have created it a moment ago; reuse it instead of failing.
        const found = await tx.category.findFirst({ where: { name: { equals: name, mode: "insensitive" } }, select: { id: true } });
        const id = found?.id ?? (await tx.category.create({ data: { name, createdById: actor.id }, select: { id: true } })).id;
        ids.set(key, id);
      }
      let n = 0;
      for (const v of a._valid) {
        const input = v.input;
        await tx.question.create({
          data: {
            categoryId: ids.get(v.categoryName.toLowerCase())!,
            createdById: actor.id,
            type: input.type, text: input.text, difficulty: input.difficulty, defaultMarks: input.marks,
            explanation: input.explanation, modelAnswer: input.type === "WRITTEN" ? input.modelAnswer : null,
            options: { create: input.type === "WRITTEN" ? [] : input.options.map((o, orderIndex) => ({ ...o, orderIndex })) },
          },
        });
        n++;
      }
      return n;
    },
    { timeout: 60_000 },
  );
  return { imported: created, newCategories: a.newCategories, warnings: a.warnings };
}
