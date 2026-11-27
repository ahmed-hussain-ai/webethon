import { z } from "zod";

// Shared by the API and the browser form, and mirrors the DB triggers exactly:
//   SINGLE_CHOICE : 2–10 options, exactly 1 correct
//   MULTI_SELECT  : 2–10 options, ≥1 correct and ≥1 incorrect
//   WRITTEN       : no options, correct (model) answer REQUIRED. It is the grading reference.
//   all           : no duplicate option text (case/space-insensitive)

export const QUESTION_TYPES = ["SINGLE_CHOICE", "MULTI_SELECT", "WRITTEN"] as const;
export const DIFFICULTIES = ["EASY", "MEDIUM", "HARD"] as const;
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 10;

export const TYPE_LABEL = { SINGLE_CHOICE: "Single choice", MULTI_SELECT: "Multiple select", WRITTEN: "Written" } as const;
export const DIFFICULTY_LABEL = { EASY: "Easy", MEDIUM: "Medium", HARD: "Hard" } as const;

const uuid = z.uuid({ error: "Choose a valid category" });

export const marksSchema = z.coerce
  .number({ error: "Marks must be a number" })
  .refine(Number.isFinite, "Marks must be a number")
  .refine((n) => n > 0, "Marks must be greater than 0")
  .refine((n) => n <= 1000, "Marks can be at most 1000")
  .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9, "Marks can have at most 2 decimal places");

const optionSchema = z.object({
  text: z.string({ error: "Option text is required" }).trim().min(1, "Option text cannot be empty").max(1000, "Option is too long (max 1000 characters)"),
  isCorrect: z.boolean().default(false),
});

const optionalLongText = (label: string) =>
  z
    .string()
    .trim()
    .max(5000, `${label} is too long (max 5000 characters)`)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

const base = {
  categoryId: uuid,
  difficulty: z.enum(DIFFICULTIES, { error: "Choose a difficulty" }),
  marks: marksSchema,
  text: z.string({ error: "Question text is required" }).trim().min(1, "Question text is required").max(5000, "Question is too long (max 5000 characters)"),
  explanation: optionalLongText("Explanation"),
};

const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

function checkOptions(type: "SINGLE_CHOICE" | "MULTI_SELECT") {
  return (opts: { text: string; isCorrect: boolean }[], ctx: z.RefinementCtx) => {
    if (opts.length < MIN_OPTIONS || opts.length > MAX_OPTIONS) {
      ctx.addIssue({ code: "custom", path: [], message: `Add between ${MIN_OPTIONS} and ${MAX_OPTIONS} options` });
    }
    const seen = new Map<string, number>();
    opts.forEach((o, i) => {
      const k = norm(o.text);
      if (k && seen.has(k)) ctx.addIssue({ code: "custom", path: [i, "text"], message: `Same text as option ${seen.get(k)! + 1}` });
      else seen.set(k, i);
    });
    const correct = opts.filter((o) => o.isCorrect).length;
    if (type === "SINGLE_CHOICE" && correct !== 1) {
      ctx.addIssue({ code: "custom", path: [], message: "Mark exactly one option as correct" });
    }
    if (type === "MULTI_SELECT") {
      if (correct < 1) ctx.addIssue({ code: "custom", path: [], message: "Mark at least one option as correct" });
      else if (correct === opts.length) ctx.addIssue({ code: "custom", path: [], message: "At least one option must be incorrect" });
    }
  };
}

export const questionInputSchema = z.discriminatedUnion(
  "type",
  [
    z.object({ ...base, type: z.literal("SINGLE_CHOICE"), options: z.array(optionSchema).superRefine(checkOptions("SINGLE_CHOICE")) }),
    z.object({ ...base, type: z.literal("MULTI_SELECT"), options: z.array(optionSchema).superRefine(checkOptions("MULTI_SELECT")) }),
    z.object({
      ...base,
      type: z.literal("WRITTEN"),
      options: z.array(optionSchema).max(0, "Written questions cannot have options").optional().default([]),
      modelAnswer: z
        .string({ error: "Enter the correct answer" })
        .trim()
        .min(1, "Enter the correct answer. It is used to grade candidates' answers")
        .max(5000, "Correct answer is too long (max 5000 characters)"),
    }),
  ],
  { error: "Choose a question type" },
);
export type QuestionInput = z.output<typeof questionInputSchema>;

// Edit = full replacement + the version the editor started from (stops silent overwrites).
export const questionUpdateSchema = z.intersection(
  questionInputSchema,
  z.object({ updatedAt: z.iso.datetime({ error: "Missing version, reload the page" }) }),
);

export const categoryInputSchema = z.object({
  name: z.string({ error: "Name is required" }).trim().min(1, "Name is required").max(80, "Name is too long (max 80 characters)"),
  description: z
    .string()
    .trim()
    .max(500, "Description is too long (max 500 characters)")
    .optional()
    .nullable()
    .transform((v) => (v ? v : null)),
});

export const questionListQuerySchema = z.object({
  q: z.string().trim().max(200).optional().catch(undefined),
  category: z.uuid().optional().catch(undefined),
  type: z.enum(QUESTION_TYPES).optional().catch(undefined),
  difficulty: z.enum(DIFFICULTIES).optional().catch(undefined),
  status: z.enum(["active", "inactive", "all"]).default("active").catch("active"),
  mine: z.enum(["1"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10_000).default(1).catch(1),
});
export type QuestionListQuery = z.output<typeof questionListQuerySchema>;

export const normaliseText = norm;
