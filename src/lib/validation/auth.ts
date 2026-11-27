import { z } from "zod";

// Email: trimmed, lower-cased, must be a real email shape (local@domain.tld).
// "abc", "abc@", "@x.com", "a b@x.com" are all rejected.
export const emailSchema = z
  .string({ error: "Email is required" })
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .max(254, "Email is too long")
  .pipe(z.email({ error: "Enter a valid email address" }));

// bcrypt only uses the first 72 BYTES, so longer passwords would silently be truncated.
export const passwordSchema = z
  .string({ error: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  // Leading/trailing spaces are almost always copy-paste accidents. Forbidding them when a
  // password is SET makes it safe to trim them when a password is USED (login).
  .refine((p) => p === p.trim(), "Password can't start or end with a space")
  .refine((p) => new TextEncoder().encode(p).length <= 72, "Password must be at most 72 bytes")
  .refine((p) => /[A-Za-z]/.test(p), "Password must contain a letter")
  .refine((p) => /[0-9]/.test(p), "Password must contain a number");

export const nameSchema = z
  .string({ error: "Name is required" })
  .trim()
  .min(2, "Name must be at least 2 characters")
  .max(100, "Name must be at most 100 characters")
  .refine((n) => !/[\u0000-\u001f\u007f<>]/.test(n), "Name contains invalid characters");

// Public signup. Any "role" sent by the client is stripped: signup ALWAYS creates a candidate.
export const signupSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
});

// Login checks only presence; strength rules apply when a password is SET, not when it is used.
export const loginSchema = z.object({
  email: emailSchema,
  password: z.string({ error: "Password is required" }).trim().min(1, "Password is required").max(200),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string({ error: "Current password is required" }).trim().min(1, "Current password is required").max(200),
    newPassword: passwordSchema,
  })
  .refine((d) => d.currentPassword !== d.newPassword, {
    path: ["newPassword"],
    message: "New password must be different from the current password",
  });

// Account created by an admin or examiner. Password is generated server-side, never supplied.
export const createUserSchema = z.object({
  name: nameSchema,
  email: emailSchema,
  role: z.enum(["ADMIN", "EXAMINER", "CANDIDATE"], { error: "Role must be ADMIN, EXAMINER or CANDIDATE" }),
});
