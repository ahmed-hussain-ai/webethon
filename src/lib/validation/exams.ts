import { z } from "zod";
import { DIFFICULTIES, QUESTION_TYPES } from "./questions";

const twoDp = (n: number) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-9;
const isoOrNull = z
  .union([z.iso.datetime({ offset: true, error: "Enter a valid date and time" }), z.literal(""), z.null()])
  .transform((v) => (v ? new Date(v) : null));
const optText = (max: number, label: string) =>
  z.string().trim().max(max, `${label} is too long (max ${max} characters)`).optional().nullable().transform((v) => (v ? v : null));

export const MULTI_SELECT_RULES = ["ALL_OR_NOTHING", "PARTIAL"] as const;
export const MULTI_RULE_LABEL = {
  ALL_OR_NOTHING: "All-or-nothing: full marks only if exactly the correct options are selected",
  PARTIAL: "Partial: marks × (correct picked − wrong picked) ÷ total correct, never below 0",
} as const;

export const examCreateSchema = z.object({
  title: z.string({ error: "Title is required" }).trim().min(1, "Title is required").max(200, "Title is too long (max 200 characters)"),
});

export const examDetailsSchema = z
  .object({
    title: examCreateSchema.shape.title,
    description: optText(5000, "Description"),
    instructions: optText(10000, "Instructions"),
    startAt: isoOrNull,
    endAt: isoOrNull,
    durationMinutes: z.coerce.number({ error: "Duration must be a number" }).int("Duration must be whole minutes").min(1, "Duration must be at least 1 minute").max(1440, "Duration can be at most 24 hours (1440 minutes)"),
    totalMarks: z.coerce.number({ error: "Total marks must be a number" }).gt(0, "Total marks must be greater than 0").max(10000, "Total marks can be at most 10000").refine(twoDp, "At most 2 decimal places"),
    passMarks: z.coerce.number({ error: "Pass marks must be a number" }).min(0, "Pass marks cannot be negative").refine(twoDp, "At most 2 decimal places"),
    shuffleQuestions: z.boolean().default(false),
    shuffleOptions: z.boolean().default(false),
    multiSelectRule: z.enum(MULTI_SELECT_RULES).default("ALL_OR_NOTHING"),
    autoCheckWritten: z.boolean().default(true),
  })
  .superRefine((d, ctx) => {
    if (d.passMarks > d.totalMarks) ctx.addIssue({ code: "custom", path: ["passMarks"], message: "Pass marks cannot be more than total marks" });
    if (d.startAt && d.endAt) {
      if (d.endAt <= d.startAt) ctx.addIssue({ code: "custom", path: ["endAt"], message: "End must be after start" });
      else if (d.endAt.getTime() - d.startAt.getTime() < d.durationMinutes * 60_000) {
        ctx.addIssue({ code: "custom", path: ["endAt"], message: `The window must be at least as long as the duration (${d.durationMinutes} min)` });
      }
    } else if (d.startAt && !d.endAt) ctx.addIssue({ code: "custom", path: ["endAt"], message: "Set an end time too" });
    else if (!d.startAt && d.endAt) ctx.addIssue({ code: "custom", path: ["startAt"], message: "Set a start time too" });
  });

export const examUpdateSchema = z.intersection(
  examDetailsSchema,
  z.object({ updatedAt: z.iso.datetime({ error: "Missing version, reload the page" }) }),
);

const marks = z.coerce.number().gt(0, "Marks must be greater than 0").max(1000, "Marks can be at most 1000").refine(twoDp, "At most 2 decimal places");

export const examQuestionsSchema = z.object({
  updatedAt: z.iso.datetime({ error: "Missing version, reload the page" }),
  items: z
    .array(
      z
        .object({
          questionId: z.uuid(),
          marks,
          negativeMarks: z.coerce.number().min(0, "Negative marks cannot be below 0").refine(twoDp, "At most 2 decimal places").default(0),
        })
        .refine((i) => i.negativeMarks <= i.marks, { path: ["negativeMarks"], message: "Negative marks cannot exceed the question's marks" }),
    )
    .max(200, "An exam can have at most 200 questions")
    .refine((items) => new Set(items.map((i) => i.questionId)).size === items.length, "The same question is added twice"),
});

export const randomPickSchema = z.object({
  excludeIds: z.array(z.uuid()).max(200).default([]),
  rules: z
    .array(
      z.object({
        categoryId: z.uuid().nullable().optional(),
        difficulty: z.enum(DIFFICULTIES).nullable().optional(),
        type: z.enum(QUESTION_TYPES).nullable().optional(),
        count: z.coerce.number().int("Whole number").min(1, "At least 1").max(50, "At most 50 per rule"),
      }),
    )
    .min(1, "Add at least one rule")
    .max(10, "At most 10 rules"),
});

export const enrollEmailsSchema = z.object({
  emails: z.array(z.string()).min(1, "Enter at least one email").max(500, "At most 500 emails at once"),
});

export const candidateImportSchema = z.object({
  content: z.string({ error: "File content is required" }),
  dryRun: z.boolean().default(true),
});
