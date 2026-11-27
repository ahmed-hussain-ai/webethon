import "server-only";
import { z } from "zod";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api";
import type { CurrentUser } from "@/lib/auth/current-user";
import { generateTempPassword, hashPassword } from "@/lib/auth/password";
import { nameSchema } from "@/lib/validation/auth";

export const userListSchema = z.object({
  q: z.string().trim().max(100).optional().catch(undefined),
  role: z.enum(["ADMIN", "EXAMINER", "CANDIDATE"]).optional().catch(undefined),
  status: z.enum(["active", "inactive"]).optional().catch(undefined),
  page: z.coerce.number().int().min(1).max(10000).default(1).catch(1),
});
export const userUpdateSchema = z.object({
  name: nameSchema.optional(),
  role: z.enum(["ADMIN", "EXAMINER", "CANDIDATE"]).optional(),
  isActive: z.boolean().optional(),
});
const PAGE = 25;

export async function listUsers(q: z.output<typeof userListSchema>) {
  const where = {
    ...(q.q ? { OR: [{ name: { contains: q.q, mode: "insensitive" as const } }, { email: { contains: q.q.toLowerCase() } }] } : {}),
    ...(q.role ? { role: q.role } : {}),
    ...(q.status ? { isActive: q.status === "active" } : {}),
  };
  const [total, users, counts] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where, orderBy: [{ role: "asc" }, { name: "asc" }], skip: (q.page - 1) * PAGE, take: PAGE,
      select: { id: true, name: true, email: true, role: true, isActive: true, mustChangePassword: true, lastLoginAt: true, createdAt: true, lockedUntil: true },
    }),
    db.user.groupBy({ by: ["role"], _count: true }),
  ]);
  return {
    total, page: q.page, pages: Math.max(1, Math.ceil(total / PAGE)),
    counts: Object.fromEntries(counts.map((c) => [c.role, c._count])) as Record<string, number>,
    users: users.map((u) => ({
      id: u.id, name: u.name, email: u.email, role: u.role, isActive: u.isActive, mustChangePassword: u.mustChangePassword,
      lastLoginAt: u.lastLoginAt?.toISOString() ?? null, createdAt: u.createdAt.toISOString(),
      locked: !!u.lockedUntil && u.lockedUntil > new Date(),
    })),
  };
}
export type UserRow = Awaited<ReturnType<typeof listUsers>>["users"][number];

/**
 * Admin edits a user. Admins can't change their own role or deactivate themselves (no
 * accidental lock-out); the DB additionally protects the last admin and roles in use.
 * Role change / deactivation ends all of the user's sessions immediately.
 */
export async function updateUser(actor: CurrentUser, id: string, input: z.output<typeof userUpdateSchema>) {
  const user = await db.user.findUnique({ where: { id } });
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
  if (id === actor.id && ((input.role && input.role !== user.role) || input.isActive === false)) {
    throw new ApiError(409, "SELF_CHANGE", "You can't change your own role or deactivate your own account.");
  }
  const securityChange = (!!input.role && input.role !== user.role) || (input.isActive !== undefined && input.isActive !== user.isActive);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id },
      data: {
        ...input,
        ...(securityChange ? { tokenVersion: { increment: 1 } } : {}),
        ...(input.isActive ? { lockedUntil: null, failedLoginCount: 0 } : {}),
      },
    });
    if (securityChange) await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({
      data: { actorId: actor.id, action: "USER_UPDATED", entityType: "user", entityId: id, details: { before: { name: user.name, role: user.role, isActive: user.isActive }, after: input } },
    });
  });
}

/** New unique temporary password (shown once); the user must change it; all sessions end. */
export async function resetPassword(actor: CurrentUser, id: string) {
  const user = await db.user.findUnique({ where: { id }, select: { id: true } });
  if (!user) throw new ApiError(404, "NOT_FOUND", "User not found");
  if (id === actor.id) throw new ApiError(409, "SELF_CHANGE", "Use 'Change password' for your own account.");
  const temp = generateTempPassword();
  const hash = await hashPassword(temp);
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id }, data: { passwordHash: hash, mustChangePassword: true, tokenVersion: { increment: 1 }, failedLoginCount: 0, lockedUntil: null } });
    await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({ data: { actorId: actor.id, action: "PASSWORD_RESET", entityType: "user", entityId: id, details: {} } });
  });
  return { tempPassword: temp };
}
