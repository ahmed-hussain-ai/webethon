import "server-only";
import Papa from "papaparse";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { emailSchema, nameSchema } from "@/lib/validation/auth";
import { loadOwnedExam } from "./service";

const IMPORT_MAX_ROWS = 500;

function assertOpenForEnrollment(exam: { endAt: Date | null }) {
  if (exam.endAt && exam.endAt <= new Date()) {
    throw new ApiError(409, "EXAM_ENDED", "This exam has ended; candidates can no longer be enrolled.");
  }
}

export async function listEnrollments(actor: CurrentUser, examId: string) {
  await loadOwnedExam(actor, examId);
  const rows = await db.enrollment.findMany({
    where: { examId },
    orderBy: [{ status: "asc" }, { enrolledAt: "desc" }],
    include: { candidate: { select: { id: true, name: true, email: true, isActive: true, mustChangePassword: true } } },
  });
  return rows.map((r) => ({
    id: r.id, status: r.status, enrolledAt: r.enrolledAt.toISOString(), revokedAt: r.revokedAt?.toISOString() ?? null,
    candidate: r.candidate,
  }));
}

/** Staff search for candidates to enroll (active candidates only, max 20). */
export async function searchCandidates(q: string) {
  const term = q.trim().slice(0, 100);
  return db.user.findMany({
    where: {
      role: "CANDIDATE", isActive: true,
      ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { email: { contains: term.toLowerCase() } }] } : {}),
    },
    orderBy: { name: "asc" },
    take: 20,
    select: { id: true, name: true, email: true },
  });
}

/** Upsert: new → ACTIVE; previously revoked → re-activated; already active → unchanged. */
async function enrollIds(actor: CurrentUser, examId: string, candidateIds: string[]) {
  let added = 0, reactivated = 0, already = 0;
  await db.$transaction(async (tx) => {
    const existing = await tx.enrollment.findMany({ where: { examId, candidateId: { in: candidateIds } } });
    const byCandidate = new Map(existing.map((e) => [e.candidateId, e]));
    for (const cid of candidateIds) {
      const e = byCandidate.get(cid);
      if (!e) {
        await tx.enrollment.create({ data: { examId, candidateId: cid, enrolledById: actor.id } });
        added++;
      } else if (e.status === "REVOKED") {
        await tx.enrollment.update({ where: { id: e.id }, data: { status: "ACTIVE", revokedAt: null, enrolledById: actor.id, enrolledAt: new Date() } });
        reactivated++;
      } else already++;
    }
  });
  return { added, reactivated, already };
}

/** Enroll existing accounts by email. Unknown emails / non-candidates are reported, not created. */
export async function enrollByEmails(actor: CurrentUser, examId: string, rawEmails: string[]) {
  const exam = await loadOwnedExam(actor, examId);
  assertOpenForEnrollment(exam);
  const invalid: string[] = [];
  const emails = new Set<string>();
  for (const raw of rawEmails) {
    const r = emailSchema.safeParse(raw);
    if (r.success) emails.add(r.data);
    else if (raw.trim()) invalid.push(raw.trim());
  }
  const users = await db.user.findMany({ where: { email: { in: [...emails] } }, select: { id: true, email: true, role: true, isActive: true } });
  const found = new Map(users.map((u) => [u.email, u]));
  const notFound = [...emails].filter((e) => !found.has(e));
  const notCandidate = users.filter((u) => u.role !== "CANDIDATE").map((u) => u.email);
  const inactive = users.filter((u) => u.role === "CANDIDATE" && !u.isActive).map((u) => u.email);
  const ok = users.filter((u) => u.role === "CANDIDATE" && u.isActive).map((u) => u.id);
  const result = ok.length ? await enrollIds(actor, examId, ok) : { added: 0, reactivated: 0, already: 0 };
  return { ...result, invalid, notFound, notCandidate, inactive };
}

export async function revokeEnrollment(actor: CurrentUser, examId: string, enrollmentId: string) {
  await loadOwnedExam(actor, examId);
  const res = await db.enrollment.updateMany({
    where: { id: enrollmentId, examId, status: "ACTIVE" },
    data: { status: "REVOKED", revokedAt: new Date() },
  });
  if (res.count === 0) throw new ApiError(404, "NOT_FOUND", "Enrollment not found or already revoked");
}

/**
 * CSV "name,email" → for each row: existing candidate → enroll; unknown email → create a
 * candidate with a UNIQUE random temporary password (shown once) → enroll.
 * Dry run first; commit is all-or-nothing and only with zero errors.
 */
export async function importCandidates(actor: CurrentUser, examId: string, content: string, dryRun: boolean) {
  const exam = await loadOwnedExam(actor, examId);
  assertOpenForEnrollment(exam);
  if (new TextEncoder().encode(content).length > 1_000_000) throw new ApiError(413, "FILE_TOO_LARGE", "File is larger than 1 MB.");

  const parsed = Papa.parse<Record<string, string>>(content.replace(/^﻿/, ""), {
    header: true, skipEmptyLines: "greedy", transformHeader: (h) => h.trim().toLowerCase(),
  });
  const fields = parsed.meta.fields ?? [];
  if (!fields.includes("name") || !fields.includes("email")) {
    throw new ApiError(400, "INVALID_FILE", "The CSV needs two columns: name, email");
  }
  if (!parsed.data.length) throw new ApiError(400, "INVALID_FILE", "The file has no rows");
  if (parsed.data.length > IMPORT_MAX_ROWS) throw new ApiError(400, "TOO_MANY_ROWS", `At most ${IMPORT_MAX_ROWS} candidates per file`);

  const errors: { row: number; message: string }[] = [];
  const rows: { row: number; name: string; email: string }[] = [];
  const seen = new Map<string, number>();
  parsed.data.forEach((rec, i) => {
    const row = i + 2;
    const name = nameSchema.safeParse(rec.name ?? "");
    const email = emailSchema.safeParse(rec.email ?? "");
    if (!name.success) errors.push({ row, message: `Name: ${name.error.issues[0].message}` });
    if (!email.success) errors.push({ row, message: `Email: ${email.error.issues[0].message}` });
    if (email.success) {
      if (seen.has(email.data)) errors.push({ row, message: `Same email as row ${seen.get(email.data)}` });
      else seen.set(email.data, row);
    }
    if (name.success && email.success) rows.push({ row, name: name.data, email: email.data });
  });

  const users = await db.user.findMany({ where: { email: { in: rows.map((r) => r.email) } }, select: { id: true, email: true, role: true, isActive: true } });
  const byEmail = new Map(users.map((u) => [u.email, u]));
  for (const r of rows) {
    const u = byEmail.get(r.email);
    if (u && u.role !== "CANDIDATE") errors.push({ row: r.row, message: `${r.email} belongs to ${u.role === "ADMIN" ? "an admin" : "an examiner"} account, not a candidate` });
    else if (u && !u.isActive) errors.push({ row: r.row, message: `${r.email} is deactivated` });
  }
  const existingCount = rows.filter((r) => byEmail.has(r.email)).length;
  const summary = { total: parsed.data.length, errors, existing: existingCount, toCreate: rows.length - existingCount };
  if (dryRun) return { ...summary, created: [] as { name: string; email: string; tempPassword: string }[] };

  if (errors.length) {
    throw new ApiError(400, "IMPORT_HAS_ERRORS", `${new Set(errors.map((e) => e.row)).size} row(s) have errors. Nothing was imported.`);
  }

  const created: { name: string; email: string; tempPassword: string }[] = [];
  const toHash = rows.filter((r) => !byEmail.has(r.email)).map((r) => ({ ...r, tempPassword: generateTempPassword() }));
  const hashes = await Promise.all(toHash.map((r) => hashPassword(r.tempPassword)));
  await db.$transaction(
    async (tx) => {
      const ids: string[] = [];
      for (const [i, r] of toHash.entries()) {
        const u = await tx.user.create({
          data: { name: r.name, email: r.email, role: "CANDIDATE", passwordHash: hashes[i], mustChangePassword: true, preferences: { create: {} } },
          select: { id: true },
        });
        ids.push(u.id);
        created.push({ name: r.name, email: r.email, tempPassword: r.tempPassword });
      }
      ids.push(...rows.filter((r) => byEmail.has(r.email)).map((r) => byEmail.get(r.email)!.id));
      const existing = await tx.enrollment.findMany({ where: { examId, candidateId: { in: ids } } });
      const have = new Map(existing.map((e) => [e.candidateId, e]));
      for (const cid of ids) {
        const e = have.get(cid);
        if (!e) await tx.enrollment.create({ data: { examId, candidateId: cid, enrolledById: actor.id } });
        else if (e.status === "REVOKED") await tx.enrollment.update({ where: { id: e.id }, data: { status: "ACTIVE", revokedAt: null } });
      }
    },
    { timeout: 60_000 },
  );
  return { ...summary, created };
}
