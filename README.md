# SecureExam: Secure Examination Management System

Web-e-Thon · Technoverse 5.0 · COMSATS University Lahore

A full-stack platform to **create, conduct, monitor and evaluate** online exams for three roles (administrator, examiner, candidate), built for integrity, fairness and failure-resilience.

**Stack:** Next.js 16 (App Router, TypeScript, Tailwind 4) · PostgreSQL 16 · Prisma 7 · pdf-lib + qrcode · zod. No paid service is required.

---

## Test credentials

All demo accounts use the password **`Password@123`**.

| Role | Email | What to try |
|---|---|---|
| Administrator | `admin@exam.test` | Users page: roles, activate/deactivate, password reset |
| Examiner | `examiner@exam.test` | Exams, question bank, live monitor, marking, results, disputes |
| Examiner 2 | `examiner2@exam.test` | Can't see examiner 1's exams (ownership) |
| Candidate | `candidate1@exam.test` … `candidate5@exam.test` | My Exams, take an exam, results, raise a dispute |

Demo data (`npm run db:seed`) includes:
- **Web Fundamentals Quiz**: open now, candidates 1–4 enrolled; take it as a candidate.
- **Database Systems Midterm**: opens tomorrow (upcoming).
- **Security Basics**: a draft owned by examiner 2.
- **Programming Fundamentals Final**: *completed* two days ago with **published results**: statistics, analytics, PDF reports, an open dispute, recorded incidents.

---

## Setup

Requirements: Node.js 20+, Docker (or any PostgreSQL 16).

```bash
# 1. Database
docker run -d --name webethon-pg -e POSTGRES_USER=webethon -e POSTGRES_PASSWORD=webethon_dev \
  -e POSTGRES_DB=webethon -p 127.0.0.1:5444:5432 postgres:16

# 2. App
cp .env.example .env
#    set AUTH_SECRET:  openssl rand -base64 48
npm install            # also generates the Prisma client
npm run db:deploy      # tables + database rules (migrations)
npm run db:seed        # demo data (wipes the database)
npm run dev            # http://localhost:3000
```

Production: `npm run build && npm start`. Behind nginx/Vercel set `TRUST_PROXY="true"`; HTTPS is required in production (secure cookies).

### Environment (`.env`)
| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection |
| `AUTH_SECRET` | yes | Signs sessions (≥ 32 random chars; the server refuses placeholders) |
| `TRUST_PROXY` | behind a proxy | Use `X-Forwarded-For` for per-IP rate limits |
| `ALLOW_PUBLIC_SIGNUP` | no | `false` disables candidate self-signup |
| `LLM_API_KEY`, `LLM_BASE_URL`, `LLM_MODEL` | no | Optional AI-suggested marks for written answers (any OpenAI-compatible API). Without it, examiners mark manually. |
| `APP_URL` | no | Public URL used in report QR codes |
| `ALLOWED_DEV_ORIGINS` | dev only | Extra hosts allowed to open the dev server |

---

## Features → problem statement

### Core (section 03)
| § | Implemented |
|---|---|
| 3.1 Auth | Login/signup (candidates only), bcrypt, signed `httpOnly` sessions stored server-side (logout revokes), role **always re-read from the database**, server-side checks on every API route, lockout + per-IP rate limits, temporary passwords for staff-created accounts, admin user management |
| 3.2 Exams | Draft → published → (computed) upcoming/ongoing/completed; settings, schedule, duration, marks, pass marks, multi-select rule, shuffling; review checklist before publishing; lifecycle locks enforced in the DB |
| 3.3 Questions | Shared bank with categories and difficulty; single/multi/written with required correct answers; CSV/JSON import; random pick by category/difficulty/type; **paper frozen per attempt** (snapshot) |
| 3.4 Candidates | Enrollment by search, emails or CSV (creates accounts with unique temporary passwords); My Exams (available / upcoming / completed); window and eligibility enforced |
| 3.5 Interface | Navigator (answered / unanswered / marked for review), server-synced timer, autosave, resume after refresh, review & submit, auto-submit at deadline |
| 3.6 Monitoring | Live attempts (progress, time left, last seen), incident feed (tab/window switch, copy/paste, fullscreen exit, connection) with note/dismiss and an explicit "not evidence" notice, announcements |
| 3.7 Grading | Automatic objective marking (all-or-nothing / partial / negative); manual marking of written answers validated against max marks; optional AI suggestion (examiner confirms); consistent totals |
| 3.8 Results | Controlled publishing (after the exam ends, everything marked); candidates see only their own; summary stats, distribution; attempts retained |

### Secondary (section 04)
| § | Implemented |
|---|---|
| 4.1 Network-aware | Live save/connection status, offline banner, local queue that resends automatically |
| 4.2 PDF reports | Candidate result report and exam performance report (real data, access-controlled) |
| 4.3 Sandbox | "Preview as candidate" in any exam state; never counted anywhere |
| 4.4 Bulk import | Questions (CSV/JSON) and candidates (CSV): dry run with per-row errors, all-or-nothing |
| 4.5 Question analytics | Average %, full-mark rate, skip rate, set vs observed difficulty, most common wrong option |
| 4.6 Verifiable reports | Random code + QR → public `/verify` page with masked name; reports become "superseded" if marks change |
| 4.7 Workspace | Text size, split layout, question-list position, theme, high contrast, saved to the account |
| 4.8 Scratchpad | Rough-work pad saved on the device and server; never marked |

---

## Innovation challenges (section 05)

### 5.4 Trust & Dispute Resolution (primary)
**Problem:** candidates have no fair, visible way to challenge a mark, and examiners have no accountable way to fix one. Changing scores after publication also undermines trust in issued results.

**Solution:**
- **Raise:** after results are published, within a dispute window (72 h), a candidate disputes a specific question or the whole result. Categories: marking error, ambiguous question, technical problem, or other. There is one open dispute per topic and at most 5 per exam, to prevent spam.
- **Review:** the examiner sees the candidate's answer next to the correct answer and the current mark. They **accept** with a corrected mark or **reject**. A written response is always required, and the candidate sees it.
- **Fairness:** for ambiguous questions, *"apply to every candidate"* raises everyone's mark on that question to the same value and **never lowers anyone**.
- **Integrity:**
  - after publishing, marks can change **only** through a dispute (enforced by a database trigger);
  - each decision records the score before and after;
  - an append-only **audit log** (also enforced by the database) records every change;
  - the old PDF verification code automatically shows **"superseded"**.

### 5.3 Failure-resilient examinations
- Every answer change is saved immediately with a sequence number. The server keeps only the newest, so delayed requests can't overwrite newer answers.
- Unsynced answers and the scratchpad are kept **on the device**. They survive refresh, crash and offline periods, and resend automatically.
- **No extra time:** the deadline is fixed by the server at start, as min(start + duration, closing time). The timer follows server time, and offline time still counts.
- If the closing time is extended, only candidates who were cut short get time back, never more than the duration.
- The server closes attempts at the deadline even if the browser is gone, using only answers that arrived in time (+2 s transit allowance).

### 5.1 Integrity in the AI era (supporting)
- Privacy-friendly signals only, with no camera, microphone or screen capture: tab and window switches, copy/paste, fullscreen exits.
- Shown as **indicators to review**, never as proof.
- Optional fullscreen requirement; devices without fullscreen support are exempt.
- Shuffled question and option order per candidate.

---

## Security & data integrity
- **Business rules enforced in PostgreSQL** (CHECK constraints and triggers), not only in the app. Examples:
  - single choice has exactly 1 correct option;
  - one attempt per candidate;
  - answers are refused after the deadline;
  - the frozen paper is immutable;
  - results can't be published while answers are unmarked;
  - the last admin can't be demoted.
- Answer keys never leave staff endpoints. Candidates and other examiners get 404 for resources that aren't theirs.
- Every state-changing request is checked for same origin (CSRF protection); responses are `no-store`; security headers are set; validation runs in the browser and on the server (zod).
- Idempotent start and submit; optimistic concurrency (`updatedAt`) for edits; race-safe grading.

## Documentation
- [docs/DATA_MODEL.md](docs/DATA_MODEL.md): tables and database rules
- [docs/AUTH.md](docs/AUTH.md): authentication, sessions, hardening
- [docs/QUESTION_BANK.md](docs/QUESTION_BANK.md): question bank and import
- [docs/EXAMS.md](docs/EXAMS.md): exam builder, lifecycle, enrollment
- [docs/CANDIDATE.md](docs/CANDIDATE.md): candidate flow and starting attempts
- [docs/WORKSPACE.md](docs/WORKSPACE.md): exam workspace, autosave, deadline, auto-marking
- [docs/DEMO.md](docs/DEMO.md): 15-minute demo script and likely judge questions

## AI marking (optional)
The rubric lives in `src/lib/results/llm.ts` (`RUBRIC`).
- **One call per written answer:** question, max marks, the examiner's correct answer and the candidate's answer.
- **Consistency:** temperature 0, strict JSON reply, score clamped and rounded to ½ mark; identical answers reuse the result.
- **Safety:** the candidate's text is treated as data. Answers that look like instructions to the marker are flagged and must be marked manually.
- **The examiner always decides**, and nothing becomes final without them.
