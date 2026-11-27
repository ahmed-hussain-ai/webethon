# Data Model & Business Rules (17 tables)

Covers PDF sections **3.1 Auth**, **3.2 Exam management**, **3.3 Question bank**, **3.4 Candidate management**, **4.7 Workspace preferences**, and the **Data integrity** paragraph of section 06.

Where each rule lives:
- **DB**: enforced by PostgreSQL (CHECK constraints and triggers in `prisma/migrations/*/migration.sql`). Even a buggy API cannot break it.
- **APP**: enforced in the API layer (`src/lib/**/service.ts`).

---

## 1. Core tables (8)

| Table | Purpose |
|---|---|
| `users` | All accounts; `role` = ADMIN / EXAMINER / CANDIDATE |
| `workspace_preferences` | Candidate exam-screen settings (theme, font size, layout, nav position, high contrast), 1 row per user (4.7) |
| `categories` | Topics for the question bank |
| `questions` | Reusable bank: type, difficulty, default marks, model answer, soft delete (`is_active`) |
| `question_options` | Choices for MCQ / multi-select, with `is_correct` |
| `exams` | Exam config, schedule, marking rule, results state |
| `exam_questions` | Which questions are in an exam, with per-exam marks and negative marks |
| `enrollments` | Which candidate may sit which exam |

## 1b. Tables added later (9)

| Table | Purpose |
|---|---|
| `sessions` | One row per login; logout revokes it server-side (a copied cookie stops working) |
| `attempts` | One sitting of an exam: server-set deadline, status, totals, scratchpad, sandbox flag (examiner preview) |
| `attempt_questions` | The candidate's **frozen paper**: order, option order, marks and a snapshot incl. correct answers |
| `answers` | Answer per question: selection/text, review flag, autosave sequence, auto/manual/AI marks, feedback |
| `attempt_events` | Integrity/connectivity signals (tab switch, paste, fullscreen exit, connection) with examiner review |
| `announcements` | Examiner messages shown live to candidates |
| `result_reports` | Issued PDF reports: public verification code + content hash (superseded when marks change) |
| `disputes` | Candidate disputes (5.4): category, explanation, status, response, marks/score before & after |
| `audit_logs` | Append-only record of publishing, disputes and user changes |

Key DB rules on these tables:
- **One real attempt** per candidate per exam (partial unique index; previews excluded).
- An attempt can only start for an **active, enrolled candidate**, on a **published** exam, **inside its window**.
- The deadline never exceeds the duration or the closing time, and can **never be shortened**. A submitted attempt can **never be reopened**.
- The frozen paper (`attempt_questions`) can't be edited.
- Extending the closing time gives back time only to attempts that were cut short, never beyond the duration.
- Answers change only while the attempt runs and **before the deadline (+2 s)**. After submission only marks can be written.
- Manual marks are 0…question marks. **After results are published, marks change only through a dispute.**
- Results can't be published with attempts still running or answers unmarked.
- One open dispute per question per attempt; resolving needs a written response.
- Audit log rows can't be updated or deleted.
- At most one current (not superseded) report per attempt.

## 2. Changes vs the original plan (and why)

| Change | Reason |
|---|---|
| `exams.status` stores only **DRAFT / PUBLISHED**. Upcoming / ongoing / completed are **computed** from `start_at`, `end_at` and the **server clock** | A stored "ongoing" goes stale if no job updates it; section 06 says timing must not depend on device clocks |
| `dispute_deadline` → **`dispute_window_hours`** (default 72) | A fixed date could fall *before* results are published. The deadline is `results_published_at + window` |
| Added `exams.settings` (JSON) | Integrity settings (fullscreen, tab-switch warnings) without new columns later |
| Added `exams.published_at`, `enrollments.revoked_at` | Audit trail of when things happened |
| Added `users.token_version` | Deactivating a user / changing role / password instantly kills their existing logins |
| Marks are `DECIMAL(…,2)`, not integers | Partial multi-select marking produces fractions |

## 3. Rules enforced by the DATABASE

### Users
- Email is stored lower-case and must look like an email. **DB**
- Name cannot be blank. **DB**
- The **last active admin** cannot be demoted or deactivated (otherwise nobody can manage the platform). **DB**
- A candidate with enrollments cannot change role; a user who owns exams cannot become a candidate. **DB**

### Questions & options
| Type | Options | Correct options |
|---|---|---|
| SINGLE_CHOICE | 2–10 | **exactly 1** |
| MULTI_SELECT | 2–10 | **at least 1 correct and at least 1 incorrect** (if every option were correct, "select all" would always win) |
| WRITTEN | **0** | n/a, uses `model_answer` instead |

- These are checked at **commit time**, so the app can replace all options of a question in one transaction. **DB**
- No duplicate option text within a question (`"Stack"` vs `" stack "` counts as a duplicate). **DB**
- `model_answer` only allowed on WRITTEN questions. **DB**
- `default_marks` must be > 0 and ≤ 1000. Text cannot be blank. **DB**
- Category names are unique **ignoring case and spaces**. **DB**
- **A question used in a PUBLISHED exam is frozen**: text, type, marks, category, difficulty and options cannot change. It can still be **deactivated**. To change it, unpublish the exam (only possible before it starts) or duplicate the question. **DB**
- A question's **type** can never change once it is assigned to any exam. **DB**
- Questions are never hard-deleted; they are deactivated (`is_active=false`), because exams reference them. **DB** (FK = RESTRICT)

### Exams
- Title cannot be blank; duration 1–1440 min; `total_marks > 0`; `0 ≤ pass_marks ≤ total_marks`. **DB**
- `end_at > start_at`, and the window must be **at least as long as the duration**. **DB**
- A PUBLISHED exam must have `start_at`, `end_at`, `published_at`. **DB**
- **Publishing is blocked** unless: ≥1 question, no deactivated questions, and **sum of question marks = total_marks**. **DB**
- While PUBLISHED, the question list **cannot change** (unpublish first). **DB**
- **Unpublish is only allowed before the window opens.** **DB**
- After the window opens: start time, duration, total marks, multi-select rule and shuffle settings are frozen; **end time can only be extended, never shortened**. **DB**
- **Only DRAFT exams can be deleted.** **DB**
- **Results can only be published after `end_at`**, and only for a published exam. **DB**
- Negative marks: `0 ≤ negative_marks ≤ marks`; **written questions cannot have negative marks**. **DB**

### Enrollments
- One enrollment per (exam, candidate). **DB**
- Only users with role CANDIDATE can be enrolled; only EXAMINER/ADMIN can enroll. **DB**
- `status = REVOKED` ⇔ `revoked_at` is set. **DB**

## 4. Rules enforced by the API (APP)

| Rule | Note |
|---|---|
| Every API route checks session + role on the **server** (3.1) | Hiding buttons is not security |
| Examiners can manage **only their own exams** (and their enrollments/results); admin can manage all | Ownership = `exams.created_by` |
| Question bank is **shared**: all examiners can read and use any active question; only the **creator or an admin** can edit/deactivate it | Our decision; the PDF says "reusable" without detail |
| Inactive users cannot log in; token check compares `token_version` | |
| Candidates see only exams they are **actively enrolled** in, and only once PUBLISHED | Drafts are invisible to candidates (3.2) |
| `is_correct` and `model_answer` are **never** sent to candidates | Section 06: protect answer keys |
| Candidate entry only when: enrolled (ACTIVE) + exam PUBLISHED + `start_at ≤ server now < end_at` | 3.4 availability window |
| Attempt deadline = **min(start_time + duration, end_at)**. A candidate who starts late gets less time; the start screen must **warn** about this | Ends fairly for everyone at `end_at` |
| Cannot enroll candidates into an exam whose window has ended | Pointless enrollment |
| Bulk import (4.4): lower-case emails, hash passwords, validate each row, report row-level errors, and run the **same** option rules (the DB rejects bad ones anyway) | |
| Partial multi-select marking: `marks × max(0, (correct picked − wrong picked) / total correct)`, rounded to 2 dp | Documented so judges can verify |
| Translate DB error codes (`INVALID_OPTIONS`, `EXAM_LOCKED`, `PUBLISH_BLOCKED`, …) into clear UI messages | Error messages begin with a stable code |

## 5. Decisions made
- **Candidate removed mid-exam:** their running attempt continues; removal only blocks new starts.
- **Closing time extended mid-exam:** running attempts cut short by the old closing time get the time back, never more than the duration.
- **Blank written answer:** scores 0 automatically, so it isn't queued for marking.
- **Negative totals:** an attempt's total never goes below 0.

## 6. Demo data (`npm run db:seed`)
Password for every account: **`Password@123`**

| Role | Email |
|---|---|
| Admin | admin@exam.test |
| Examiner | examiner@exam.test, examiner2@exam.test |
| Candidate | candidate1@exam.test … candidate5@exam.test |

Exams: **Web Fundamentals Quiz** (ongoing, shuffle + partial marking, 4 enrolled), **Database Systems Midterm** (upcoming, starts in 24 h), **Security Basics** (draft, examiner 2), **Programming Fundamentals Final** (completed 2 days ago, results published, 4 attempts, 1 absent, an open dispute, recorded incidents).
