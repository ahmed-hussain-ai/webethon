# Authentication & Accounts (backend)

Covers PDF **3.1 Authentication & Authorization** and the **Security & privacy** paragraph of section 06.
The PDF does not mention signup; those rules are our decisions (marked ★).

## Who creates which account

| Account | Created by |
|---|---|
| Candidate | ★ Public signup, **or** an examiner/admin (single or CSV import) |
| Examiner | Admin only |
| Admin | Admin only (first admin comes from the seed) |

- ★ Public signup **always** creates a CANDIDATE. A `role` field in the request is stripped and ignored.
- Signing up gives no exam access; a candidate only sees exams an examiner enrolled them in.
- `ALLOW_PUBLIC_SIGNUP="false"` turns public signup off.

## Validation (server side, `src/lib/validation/auth.ts`)
| Field | Rule |
|---|---|
| Email | trimmed, lower-cased, ≤ 254 chars, must be a real email shape (`abc`, `abc.com`, `a@`, `a b@x` are rejected) |
| Password | 8 to 72 bytes (bcrypt limit), at least one letter and one number, cannot start or end with a space. At login, surrounding spaces are trimmed (copy-paste safety) |
| Name | 2 to 100 chars after trimming, no control characters or `< >` |

## Temporary passwords ★
- Accounts made by an admin/examiner (and later the CSV import) get a **random 12-character password per user**, never a shared one.
- Generated with a secure RNG; no look-alike characters (0/O, 1/l/I).
- Returned **once** in the create response; only the bcrypt hash is stored.
- `must_change_password = true`: until it is changed, the user can only call `/me`, `/change-password`, `/logout`, `/logout-all`. Everything else returns `403 PASSWORD_CHANGE_REQUIRED`.

## Who is logged in
- The session cookie (`httpOnly`, `SameSite=Lax`, `Secure` in production, 8 h) holds a signed token with **only** the user id and `token_version`.
- On **every** request the server loads the user from the database. Identity and **role always come from the database**, never from request body, query, or token claims.
- The session is rejected if: the token is missing, tampered with or expired; the user doesn't exist or is deactivated; or `token_version` changed.
- `token_version` increases on: password change, "log out everywhere". Effect: every old session dies immediately.
- Role/active changes take effect on the very next request (no re-login needed).

## Login rules
- Wrong email and wrong password give the **same** message and take the **same time** (dummy bcrypt check), so nobody can discover which emails exist.
- "Account deactivated" is only shown **after** the correct password.
- ★ Cooldown: each 5 consecutive failures lock the account for 5 min, then 10, 20, max 30. While locked, even the right password is refused. Kept short on purpose: a long lock would let someone block a candidate from their exam.
- Success resets the failure counter and records `last_login_at`.

## Hardening (security review)
| Threat | Protection | Verified |
|---|---|---|
| Copied/stolen cookie after logout | Every login is a row in `sessions`; logout revokes that row server-side | copy rejected after logout |
| Parallel brute force | One atomic `UPDATE` counts the attempt and sets the lock, so at most 5 passwords are checked per lock window | 40 parallel guesses → 5 checked |
| Password spraying across many emails | 50 **failed** logins per IP per 10 min (successful ones don't count, so a whole lab behind one IP can sign in) | 51st failure → 429 |
| Bot signups | 20 signups per IP per 10 min | 21st → 429 |
| Discovering emails via lockout | Unknown emails lock after 5 tries exactly like real ones | identical responses |
| Weak/placeholder `AUTH_SECRET` | Server refuses to start | startup error |
| Clickjacking, MIME sniffing | `X-Frame-Options: DENY`, `frame-ancestors 'none'`, `nosniff`, HSTS, no `X-Powered-By` | headers present |
| Cached private responses | Every API response is `Cache-Control: no-store` | header present |

**Deployment note:** set `TRUST_PROXY="true"` only when running behind nginx/Vercel. Without a proxy the `X-Forwarded-For` header can be faked, so it is ignored.
Known trade-off: signup still says "email already exists" (no email service to send confirmations), and per-IP limits are in memory (one server instance).

## Other protections
- State-changing requests from another website (`Origin` mismatch) → `403 BAD_ORIGIN`.
- All errors use one shape: `{ "error": { "code", "message", "fields"? } }`, so the frontend can show field-level messages.
- ★ No "forgot password" email (no paid services allowed). An admin resets the password, which issues a new temporary one. Admin reset is a later task.

## API

| Method & path | Who | Body | Result |
|---|---|---|---|
| `POST /api/auth/signup` | anyone | `name, email, password` | 201, creates a candidate and logs them in |
| `POST /api/auth/login` | anyone | `email, password` | 200 `{ user }` (includes `role` and `mustChangePassword`) |
| `POST /api/auth/logout` | anyone | none | clears this device's session |
| `POST /api/auth/logout-all` | logged in | none | ends sessions on all devices |
| `GET /api/auth/me` | logged in | none | current user from DB |
| `POST /api/auth/change-password` | logged in | `currentPassword, newPassword` | new password; other devices logged out |
| `POST /api/users` | admin (any role), examiner (candidate only) | `name, email, role` | 201 `{ user, tempPassword }` |

## For the rest of the backend
Every route handler starts with `requireUser()` or `requireRole("EXAMINER", "ADMIN")` from `src/lib/auth/current-user.ts`, and uses the returned user's `id`. It must never use a user id sent by the client to decide whose data to touch.

## Not built yet (out of scope for this step)
Admin user list/edit, role change, deactivate/reactivate and password reset endpoints; CSV import; frontend pages.
