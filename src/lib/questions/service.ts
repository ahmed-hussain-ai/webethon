import "server-only";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import type { QuestionInput, QuestionListQuery } from "@/lib/validation/questions";

export const PAGE_SIZE = 20;

// Ownership: the bank is SHARED (any examiner can view/use any question), but only the
// creator, or an admin, may change a question or category.
const canManage = (actor: CurrentUser, createdById: string) => actor.role === "ADMIN" || actor.id === createdById;

function notFound(what = "Question") {
  return new ApiError(404, "NOT_FOUND", `${what} not found`);
}

const isUniqueViolation = (e: unknown) => e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";

// ───────────────────────── Categories ─────────────────────────

export async function listCategories() {
  const cats = await db.category.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true, name: true, description: true, createdById: true, createdAt: true,
      createdBy: { select: { name: true } },
      _count: { select: { questions: true } },
    },
  });
  return cats.map((c) => ({
    id: c.id, name: c.name, description: c.description, createdById: c.createdById,
    createdByName: c.createdBy.name, questionCount: c._count.questions, createdAt: c.createdAt,
  }));
}

const CATEGORY_TAKEN = () =>
  new ApiError(409, "CATEGORY_EXISTS", "A category with this name already exists", { name: "A category with this name already exists" });

export async function createCategory(actor: CurrentUser, input: { name: string; description: string | null }) {
  try {
    return await db.category.create({ data: { ...input, createdById: actor.id } });
  } catch (e) {
    if (isUniqueViolation(e)) throw CATEGORY_TAKEN();
    throw e;
  }
}

export async function updateCategory(actor: CurrentUser, id: string, input: { name: string; description: string | null }) {
  const cat = await db.category.findUnique({ where: { id } });
  if (!cat) throw notFound("Category");
  if (!canManage(actor, cat.createdById)) throw new ApiError(403, "FORBIDDEN", "Only the creator or an admin can edit this category");
  try {
    return await db.category.update({ where: { id }, data: input });
  } catch (e) {
    if (isUniqueViolation(e)) throw CATEGORY_TAKEN();
    throw e;
  }
}

export async function deleteCategory(actor: CurrentUser, id: string) {
  const cat = await db.category.findUnique({ where: { id }, include: { _count: { select: { questions: true } } } });
  if (!cat) throw notFound("Category");
  if (!canManage(actor, cat.createdById)) throw new ApiError(403, "FORBIDDEN", "Only the creator or an admin can delete this category");
  if (cat._count.questions > 0) {
    throw new ApiError(409, "CATEGORY_IN_USE", `This category has ${cat._count.questions} question(s). Move or remove them first.`);
  }
  try {
    await db.category.delete({ where: { id } });
  } catch (e) {
    // A question was added between the check and the delete (FK restrict).
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2003") {
      throw new ApiError(409, "CATEGORY_IN_USE", "This category now has questions. Move or remove them first.");
    }
    throw e;
  }
}

// ───────────────────────── Questions ─────────────────────────

/** Usage info that drives the 🔒 badge: locked = used in at least one PUBLISHED exam. */
async function usage(questionIds: string[]) {
  if (!questionIds.length) return new Map<string, { usedIn: number; locked: boolean }>();
  const rows = await db.examQuestion.findMany({
    where: { questionId: { in: questionIds } },
    select: { questionId: true, exam: { select: { status: true } } },
  });
  const map = new Map<string, { usedIn: number; locked: boolean }>();
  for (const r of rows) {
    const u = map.get(r.questionId) ?? { usedIn: 0, locked: false };
    u.usedIn++;
    if (r.exam.status === "PUBLISHED") u.locked = true;
    map.set(r.questionId, u);
  }
  return map;
}

export async function listQuestions(actor: CurrentUser, q: QuestionListQuery) {
  const where: Prisma.QuestionWhereInput = {
    ...(q.q ? { text: { contains: q.q, mode: "insensitive" } } : {}),
    ...(q.category ? { categoryId: q.category } : {}),
    ...(q.type ? { type: q.type } : {}),
    ...(q.difficulty ? { difficulty: q.difficulty } : {}),
    ...(q.status === "all" ? {} : { isActive: q.status === "active" }),
    ...(q.mine ? { createdById: actor.id } : {}),
  };
  const [total, rows] = await Promise.all([
    db.question.count({ where }),
    db.question.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      skip: (q.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true, type: true, text: true, difficulty: true, defaultMarks: true, isActive: true,
        createdById: true, updatedAt: true,
        category: { select: { id: true, name: true } },
        createdBy: { select: { name: true } },
        _count: { select: { options: true } },
      },
    }),
  ]);
  const use = await usage(rows.map((r) => r.id));
  return {
    total,
    page: q.page,
    pageSize: PAGE_SIZE,
    pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    items: rows.map((r) => ({
      id: r.id, type: r.type, text: r.text, difficulty: r.difficulty, marks: Number(r.defaultMarks),
      isActive: r.isActive, category: r.category, createdByName: r.createdBy.name,
      optionCount: r._count.options, updatedAt: r.updatedAt.toISOString(),
      canEdit: canManage(actor, r.createdById),
      usedIn: use.get(r.id)?.usedIn ?? 0, locked: use.get(r.id)?.locked ?? false,
    })),
  };
}

export async function getQuestion(actor: CurrentUser, id: string) {
  const q = await db.question.findUnique({
    where: { id },
    include: {
      options: { orderBy: [{ orderIndex: "asc" }, { id: "asc" }] },
      category: { select: { id: true, name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!q) throw notFound();
  const u = (await usage([id])).get(id);
  return {
    id: q.id, type: q.type, text: q.text, difficulty: q.difficulty, marks: Number(q.defaultMarks),
    modelAnswer: q.modelAnswer, explanation: q.explanation, isActive: q.isActive,
    category: q.category, createdByName: q.createdBy.name, createdById: q.createdById,
    updatedAt: q.updatedAt.toISOString(), createdAt: q.createdAt.toISOString(),
    options: q.options.map((o) => ({ id: o.id, text: o.text, isCorrect: o.isCorrect })),
    canEdit: canManage(actor, q.createdById),
    usedIn: u?.usedIn ?? 0, locked: u?.locked ?? false,
  };
}
export type QuestionDetail = Awaited<ReturnType<typeof getQuestion>>;

function questionData(input: QuestionInput) {
  return {
    categoryId: input.categoryId,
    type: input.type,
    text: input.text,
    difficulty: input.difficulty,
    defaultMarks: input.marks,
    explanation: input.explanation,
    modelAnswer: input.type === "WRITTEN" ? input.modelAnswer : null,
  };
}
const optionRows = (input: QuestionInput) =>
  input.type === "WRITTEN" ? [] : input.options.map((o, orderIndex) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex }));

async function assertCategory(tx: Prisma.TransactionClient, categoryId: string) {
  const c = await tx.category.findUnique({ where: { id: categoryId }, select: { id: true } });
  if (!c) throw new ApiError(400, "VALIDATION_FAILED", "Please fix the highlighted fields", { categoryId: "This category no longer exists" });
}

export async function createQuestion(actor: CurrentUser, input: QuestionInput) {
  return db.$transaction(async (tx) => {
    await assertCategory(tx, input.categoryId);
    return tx.question.create({
      data: { ...questionData(input), createdById: actor.id, options: { create: optionRows(input) } },
      select: { id: true },
    });
  });
}

/**
 * Full replacement of a question and its options in ONE transaction (the DB checks the
 * option rules at commit, so a half-saved question can never exist).
 * `updatedAt` must match what the editor loaded: if someone saved in between → 409.
 */
export async function updateQuestion(actor: CurrentUser, id: string, input: QuestionInput & { updatedAt: string }) {
  return db.$transaction(async (tx) => {
    const current = await tx.question.findUnique({ where: { id } });
    if (!current) throw notFound();
    if (!canManage(actor, current.createdById)) {
      throw new ApiError(403, "FORBIDDEN", "Only the creator or an admin can edit this question");
    }
    await assertCategory(tx, input.categoryId);

    const res = await tx.question.updateMany({
      where: { id, updatedAt: new Date(input.updatedAt) },
      data: { ...questionData(input), updatedAt: new Date() },
    });
    if (res.count === 0) {
      throw new ApiError(409, "EDIT_CONFLICT", "This question was changed by someone else after you opened it. Reload to see the latest version.");
    }
    await tx.questionOption.deleteMany({ where: { questionId: id } });
    const rows = optionRows(input);
    if (rows.length) await tx.questionOption.createMany({ data: rows.map((r) => ({ ...r, questionId: id })) });
    return { id };
  });
}

export async function setQuestionActive(actor: CurrentUser, id: string, isActive: boolean) {
  const q = await db.question.findUnique({ where: { id }, select: { createdById: true } });
  if (!q) throw notFound();
  if (!canManage(actor, q.createdById)) throw new ApiError(403, "FORBIDDEN", "Only the creator or an admin can change this question");
  await db.question.update({ where: { id }, data: { isActive } });
}

/** Editable copy, owned by the actor. The way to "edit" a locked question. */
export async function duplicateQuestion(actor: CurrentUser, id: string) {
  const q = await db.question.findUnique({ where: { id }, include: { options: { orderBy: { orderIndex: "asc" } } } });
  if (!q) throw notFound();
  return db.question.create({
    data: {
      categoryId: q.categoryId, createdById: actor.id, type: q.type, text: q.text, difficulty: q.difficulty,
      defaultMarks: q.defaultMarks, modelAnswer: q.modelAnswer, explanation: q.explanation,
      options: { create: q.options.map((o, i) => ({ text: o.text, isCorrect: o.isCorrect, orderIndex: i })) },
    },
    select: { id: true },
  });
}
